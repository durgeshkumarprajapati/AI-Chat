import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { configService } from '@/features/config';
import { AppError } from '@/errors';
import { telemetryAggregationService } from '@/features/performance/telemetry-aggregation.service';
import { rabbitmq, QUEUES } from '@/lib/rabbitmq';
import type * as amqp from 'amqplib';

export const dynamic = 'force-dynamic';

/**
 * Phase 91 — cheap, best-effort per-queue depth/consumer-count check via amqplib's
 * `channel.checkQueue(name)` (a real, existing AMQP passive-declare API — returns
 * `{queue, messageCount, consumerCount}` without side effects). Deliberately uses its OWN
 * dedicated channel rather than `rabbitmq`'s shared one: `checkQueue` closes its channel on
 * failure (e.g. queue not yet asserted by anything), and a shared channel being closed out from
 * under this diagnostic check would break every other caller of `rabbitmq.publishToQueue`. Never
 * throws — a failure for one queue reports `available:false` with the real reason, matching this
 * route's existing "never fabricate" convention, and never affects any other queue's check.
 */
async function checkQueueDepth(
  queueName: string
): Promise<{ available: true; messageCount: number; consumerCount: number } | { available: false; reason: string }> {
  let channel: amqp.Channel | null = null;
  try {
    const conn = await rabbitmq.getConnection();
    channel = await conn.createChannel();
    const info = await channel.checkQueue(queueName);
    return { available: true, messageCount: info.messageCount, consumerCount: info.consumerCount };
  } catch (err) {
    return { available: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    await channel?.close().catch(() => {});
  }
}

/**
 * Observability only. Every figure here is either a live round-trip measurement taken during
 * this request, or an aggregate over real persisted RagEvaluation rows — never a fabricated or
 * placeholder number. Fields that genuinely have no data source in this build (worker job
 * duration/queue wait — not persisted anywhere today) are reported as `available: false` rather
 * than invented, matching the same "no fake financial metrics" standard applied to
 * /api/admin/billing/metrics.
 */
async function handleGet(req: NextRequest) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    requireRole(authUser, UserRole.ADMIN);

    const dbStart = Date.now();
    let dbLatencyMs: number | null = null;
    let dbHealthy = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - dbStart;
      dbHealthy = true;
    } catch {
      dbLatencyMs = Date.now() - dbStart;
    }

    const redisStart = Date.now();
    let redisLatencyMs: number | null = null;
    let redisHealthy = false;
    try {
      const probeKey = 'docai:perf:healthcheck';
      await redis.set(probeKey, '1', 10);
      await redis.get(probeKey);
      redisLatencyMs = Date.now() - redisStart;
      redisHealthy = true;
    } catch {
      redisLatencyMs = Date.now() - redisStart;
    }

    // Note: RagEvaluation does not persist a cache-hit flag, so a "cache hit rate" figure isn't
    // derivable from real data here — omitted rather than approximated with an unreliable proxy.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [ragAgg, ragSampleCount] = await Promise.all([
      prisma.ragEvaluation.aggregate({
        where: { createdAt: { gte: since } },
        _avg: { latencyMs: true, retrievalLatencyMs: true, llmLatencyMs: true, llmFirstTokenMs: true }
      }),
      prisma.ragEvaluation.count({ where: { createdAt: { gte: since } } })
    ]);

    const [answerCacheTtl, singleFlightEnabled, slowQueryThresholdMs, multimodalConcurrency, apiTargetLatencyMs, slowRequestThresholdMs] =
      await Promise.all([
        configService.getNumber('RAG_CACHE_TTL_SECONDS', 300),
        configService.getBoolean('RAG_CACHE_SINGLE_FLIGHT_ENABLED', true),
        configService.getNumber('PERF_SLOW_QUERY_THRESHOLD_MS', 1000),
        configService.getNumber('MULTIMODAL_IMAGE_PROCESSING_CONCURRENCY', 3),
        configService.getNumber('PERF_API_TARGET_LATENCY_MS', 3000),
        configService.getNumber('PERF_SLOW_REQUEST_THRESHOLD_MS', 1000)
      ]);

    // Phase 88 — cross-cutting telemetry aggregation. Purely additive fields, all optional and
    // each independently best-effort: a failure in any one of them never breaks the rest of this
    // response. Every field follows the same "never fabricate, report unavailable with a reason"
    // principle as the fields above.
    const apiLatencyResult = telemetryAggregationService.getApiLatencyPercentiles();
    const apiLatency = apiLatencyResult.available
      ? {
          available: true as const,
          ...apiLatencyResult.data!,
          targetLatencyMs: apiTargetLatencyMs,
          meetsTarget: apiLatencyResult.data!.p95 <= apiTargetLatencyMs
        }
      : { available: false as const, reason: apiLatencyResult.reason! };

    const slowestOperationsResult = telemetryAggregationService.getSlowestOperations(10);
    const slowestOperations = slowestOperationsResult.available
      ? {
          available: true as const,
          slowRequestThresholdMs,
          data: slowestOperationsResult.data!.map((op) => ({ ...op, isSlow: op.avgMs > slowRequestThresholdMs }))
        }
      : { available: false as const, reason: slowestOperationsResult.reason! };

    const cacheHitRatiosResult = telemetryAggregationService.getCacheHitRatios();
    const cacheHitRatios = cacheHitRatiosResult.available
      ? { available: true as const, data: cacheHitRatiosResult.data! }
      : { available: false as const, reason: cacheHitRatiosResult.reason! };

    // Automation feature (Phase 88 sibling work, landing in parallel on this same branch) —
    // best-effort only. Never assume the table/model exists or has rows yet; on any failure
    // (table not migrated, model not yet in the generated client, etc.) report available:false
    // rather than throwing, since this route must keep working regardless of that feature's
    // in-flight state.
    let workflowMetrics: {
      available: boolean;
      sampleWindowHours?: number;
      totalExecutions?: number;
      byStatus?: Record<string, number>;
      reason?: string;
    };
    try {
      const workflowSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const statusGroups = await prisma.automationExecution.groupBy({
        by: ['status'],
        where: { createdAt: { gte: workflowSince } },
        _count: { _all: true }
      });
      const totalExecutions = statusGroups.reduce((sum, g) => sum + g._count._all, 0);
      const byStatus: Record<string, number> = {};
      for (const g of statusGroups) byStatus[g.status] = g._count._all;
      workflowMetrics =
        totalExecutions > 0
          ? { available: true, sampleWindowHours: 24, totalExecutions, byStatus }
          : { available: false, reason: 'No AutomationExecution rows in the last 24h — nothing to aggregate yet.' };
    } catch (err) {
      workflowMetrics = {
        available: false,
        reason: `Automation workflow metrics not available: ${err instanceof Error ? err.message : String(err)}`
      };
    }

    // Phase 91 — additive, best-effort RabbitMQ queue-depth/consumer-count check for every
    // declared queue in QUEUES (document-processing/knowledge-graph/multimodal/sarvam,
    // AI Intelligence, Notification, AI Agent, Automation, Memory). Each queue is checked
    // independently; one queue's failure never affects another's, or the rest of this route.
    const queueDepths: Record<string, { queue: string } & Awaited<ReturnType<typeof checkQueueDepth>>> = {};
    await Promise.all(
      Object.entries(QUEUES).map(async ([key, queueName]) => {
        const result = await checkQueueDepth(queueName);
        queueDepths[key] = { queue: queueName, ...result };
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        database: {
          available: true,
          healthy: dbHealthy,
          pingMs: dbLatencyMs
        },
        redis: {
          available: true,
          healthy: redisHealthy,
          pingMs: redisLatencyMs
        },
        rag: {
          available: ragSampleCount > 0,
          sampleWindowHours: 24,
          sampleCount: ragSampleCount,
          avgTotalLatencyMs: ragAgg._avg.latencyMs !== null ? Math.round(ragAgg._avg.latencyMs) : null,
          avgRetrievalLatencyMs: ragAgg._avg.retrievalLatencyMs !== null ? Math.round(ragAgg._avg.retrievalLatencyMs) : null,
          avgLlmLatencyMs: ragAgg._avg.llmLatencyMs !== null ? Math.round(ragAgg._avg.llmLatencyMs) : null,
          avgTimeToFirstTokenMs: ragAgg._avg.llmFirstTokenMs !== null ? Math.round(ragAgg._avg.llmFirstTokenMs) : null
        },
        cache: {
          answerCacheTtlSeconds: answerCacheTtl,
          singleFlightEnabled
        },
        worker: {
          available: false,
          reason: 'Worker job duration/queue wait time is not persisted in this build — see worker/src/index.ts for current bounded-batch polling behavior.'
        },
        config: {
          slowQueryThresholdMs,
          multimodalImageProcessingConcurrency: multimodalConcurrency
        },
        // Phase 88 — additive, optional cross-cutting telemetry aggregation. Absent/failed sources
        // report `available: false` with a real reason; never a fabricated number.
        apiLatency,
        slowestOperations,
        cacheHitRatios,
        workflowMetrics,
        // Phase 91 — additive. Per-queue message/consumer counts, keyed by the QUEUES const's
        // own key names (e.g. "AI_INTELLIGENCE_DAILY"). available:false + reason on failure.
        queueDepths
      }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to load performance metrics' } },
      { status: 500 }
    );
  }
}

export const GET = handleGet;
