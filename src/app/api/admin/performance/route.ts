import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { configService } from '@/features/config';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

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

    const [answerCacheTtl, singleFlightEnabled, slowQueryThresholdMs, multimodalConcurrency] = await Promise.all([
      configService.getNumber('RAG_CACHE_TTL_SECONDS', 300),
      configService.getBoolean('RAG_CACHE_SINGLE_FLIGHT_ENABLED', true),
      configService.getNumber('PERF_SLOW_QUERY_THRESHOLD_MS', 1000),
      configService.getNumber('MULTIMODAL_IMAGE_PROCESSING_CONCURRENCY', 3)
    ]);

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
        }
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
