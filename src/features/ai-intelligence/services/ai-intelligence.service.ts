import { AIIntelligenceSnapshot, IntelligenceClaimType, IntelligenceInsightType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { entitlementService } from '@/features/billing/entitlement.service';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { auditService } from '@/features/audit/audit.service';
// Only this single pure, dependency-free file is imported from knowledge-intelligence/ — never
// insight.repository.ts or any detection service — so this module (shared with the worker
// build) never transitively pulls in anything that imports retrievalService/knowledgeGraphService
// (see worker/tsconfig.json's NodeNext notes). New insights are written via direct prisma calls
// below, mirroring risk-blocker-detection.service.ts's own style rather than going through the
// repository.
import { evaluateConfidence } from '@/features/knowledge-intelligence/confidence.util';
import { ValidationError } from '@/errors';
import { intelligenceAggregationService } from '../aggregation/intelligence-aggregation.service';
import { intelligenceGenerationService } from '../generation/intelligence-generation.service';
import { aiIntelligenceCacheService } from '../cache/ai-intelligence-cache.service';
import { AggregatedSignals, PreferenceDTO, SignalRef, SnapshotDTO, SnapshotType } from '../types/ai-intelligence.types';

const DAY_MS = 24 * 60 * 60 * 1000;

// Bounded categories eligible to become new, durable, reviewable IntelligenceInsight rows per
// generation pass. Each category maps to one IntelligenceInsightType and one claimType.
interface InsightCategoryPlan {
  type: IntelligenceInsightType;
  claimType: IntelligenceClaimType;
  items: SignalRef[];
  titlePrefix: string;
  sourceType: string;
}

function toDateOnlyUTCKey(date: Date): string {
  return date.toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

/**
 * ISO week key ('YYYY-Www') for a UTC date, using the standard ISO-8601 week-numbering
 * convention (weeks start Monday; week 1 is the week containing the year's first Thursday).
 */
function toISOWeekKeyUTC(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Period convention (documented, chosen deliberately for Phase 85's initial scope):
 *  - DAILY:  the current UTC calendar day, [00:00:00.000, 23:59:59.999].
 *  - WEEKLY: the current ISO-8601 week (Monday 00:00:00.000 UTC through the following Sunday
 *            23:59:59.999 UTC).
 * Using UTC boundaries (rather than per-user local time) keeps the snapshot's own idempotency
 * key simple and stable regardless of a user's preferred timezone/hour — those only govern WHEN
 * the scheduler decides to trigger generation, not what period the resulting snapshot covers.
 */
function computePeriod(type: SnapshotType, now: Date): { periodStart: Date; periodEnd: Date; periodKey: string } {
  if (type === 'DAILY') {
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    return { periodStart, periodEnd, periodKey: toDateOnlyUTCKey(periodStart) };
  }

  const dayOfWeek = now.getUTCDay() === 0 ? 7 : now.getUTCDay(); // 1 (Mon) .. 7 (Sun)
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (dayOfWeek - 1), 0, 0, 0, 0));
  const sunday = new Date(monday.getTime() + 6 * DAY_MS);
  sunday.setUTCHours(23, 59, 59, 999);
  return { periodStart: monday, periodEnd: sunday, periodKey: toISOWeekKeyUTC(monday) };
}

function computeExpiresAt(type: SnapshotType, periodEnd: Date): Date {
  // Daily expires the next calendar day after the period ends; weekly expires the next week.
  return new Date(periodEnd.getTime() + (type === 'DAILY' ? DAY_MS : DAY_MS) + 1);
}

function toSnapshotDTO(snapshot: AIIntelligenceSnapshot): SnapshotDTO {
  const structuredData = (snapshot.structuredData ?? {}) as Record<string, unknown>;
  return {
    id: snapshot.id,
    type: snapshot.type,
    status: snapshot.status,
    periodStart: snapshot.periodStart.toISOString(),
    periodEnd: snapshot.periodEnd.toISOString(),
    summary: snapshot.summary,
    structuredData,
    generatedAt: snapshot.generatedAt ? snapshot.generatedAt.toISOString() : null,
    expiresAt: snapshot.expiresAt ? snapshot.expiresAt.toISOString() : null,
    usedLLM: Boolean(snapshot.modelProvider),
    createdAt: snapshot.createdAt.toISOString()
  };
}

export class AiIntelligenceService {
  /**
   * Cache-first, then a single indexed DB read of the latest READY snapshot for
   * (userId, projectId, type) whose periodEnd >= now (i.e. still current). NEVER triggers
   * generation — this is the fast path the dashboard calls on every load.
   */
  public async getSnapshot(userId: string, type: SnapshotType, projectId: string | null = null): Promise<SnapshotDTO | null> {
    if (projectId) {
      await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'VIEW_PROJECT');
    }

    const now = new Date();
    const { periodKey } = computePeriod(type, now);
    const cacheKey = aiIntelligenceCacheService.buildCacheKey(userId, projectId, type, periodKey);

    const cached = await aiIntelligenceCacheService.get(cacheKey);
    if (cached) return cached;

    const snapshot = await prisma.aIIntelligenceSnapshot.findFirst({
      where: {
        userId,
        projectId: projectId ?? null,
        type,
        status: 'READY',
        periodEnd: { gte: now }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!snapshot) return null;

    const dto = toSnapshotDTO(snapshot);
    await aiIntelligenceCacheService.set(cacheKey, dto);
    return dto;
  }

  /**
   * Generates (or returns the already-generated) snapshot for the current period. Idempotent:
   * a READY snapshot for the exact same (userId, projectId, type, periodStart) is returned
   * directly without a second aggregation/LLM call; a GENERATING snapshot (another job already
   * in flight) is returned as-is for the caller to poll, rather than starting a duplicate run.
   *
   * FAILED-status propagation choice: a FAILED snapshot row is a valid, informative state the
   * API can report (so callers can show "briefing generation failed, try again") — this method
   * does NOT throw for a downstream aggregation/generation failure; it persists status:'FAILED'
   * with errorMessage and returns that DTO. It DOES throw for entitlement/authorization/
   * disabled-feature failures, since those are caller-input problems, not generation failures.
   */
  public async generateSnapshot(
    userId: string,
    type: SnapshotType,
    projectId: string | null = null,
    opts?: { force?: boolean }
  ): Promise<SnapshotDTO> {
    await entitlementService.requireFeature(userId, 'AI_WORKSPACE_INTELLIGENCE');

    const [aiEnabled, dailyEnabled, weeklyEnabled] = await Promise.all([
      configService.getBoolean('AI_INTELLIGENCE_ENABLED', false),
      configService.getBoolean('AI_DAILY_INTELLIGENCE_ENABLED', true),
      configService.getBoolean('AI_WEEKLY_INTELLIGENCE_ENABLED', true)
    ]);
    if (!aiEnabled) {
      throw new ValidationError('AI Workspace Intelligence is disabled by configuration (AI_INTELLIGENCE_ENABLED).');
    }
    if (type === 'DAILY' && !dailyEnabled) {
      throw new ValidationError('Daily AI Workspace Intelligence is disabled by configuration (AI_DAILY_INTELLIGENCE_ENABLED).');
    }
    if (type === 'WEEKLY' && !weeklyEnabled) {
      throw new ValidationError('Weekly AI Workspace Intelligence is disabled by configuration (AI_WEEKLY_INTELLIGENCE_ENABLED).');
    }

    if (projectId) {
      await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'VIEW_PROJECT');
    }

    const now = new Date();
    const { periodStart, periodEnd } = computePeriod(type, now);

    // Application-level idempotency check via a plain `where` (never the compound-unique
    // accessor) — Prisma's generated compound-unique input type for
    // (userId, projectId, type, periodStart) does not accept `null` for the nullable `projectId`
    // leg (a `findUnique`/`upsert`-by-compound-key limitation), and relying on it would also tie
    // correctness to Postgres's "NULL is distinct from NULL" unique-constraint semantics for the
    // projectId-null case. A plain `findFirst`/manual create-or-update sidesteps both issues.
    const existing = await prisma.aIIntelligenceSnapshot.findFirst({
      where: { userId, projectId: projectId ?? null, type, periodStart }
    });

    if (!opts?.force && existing && (existing.status === 'READY' || existing.status === 'GENERATING')) {
      return toSnapshotDTO(existing);
    }

    let snapshotRow: AIIntelligenceSnapshot;
    if (existing) {
      snapshotRow = await prisma.aIIntelligenceSnapshot.update({
        where: { id: existing.id },
        data: {
          status: 'GENERATING',
          errorMessage: null,
          ...(opts?.force ? { version: { increment: 1 } } : {})
        }
      });
    } else {
      try {
        snapshotRow = await prisma.aIIntelligenceSnapshot.create({
          data: { userId, projectId: projectId ?? null, type, periodStart, periodEnd, status: 'GENERATING' }
        });
      } catch (createErr) {
        // Concurrent single-flight race: another call created the row microseconds earlier and
        // the unique constraint on (userId, projectId, type, periodStart) rejected this insert —
        // this is the DB-level authoritative idempotency gate backing up the pre-check above.
        const race = await prisma.aIIntelligenceSnapshot.findFirst({
          where: { userId, projectId: projectId ?? null, type, periodStart }
        });
        if (!race) throw createErr;
        if (!opts?.force && (race.status === 'READY' || race.status === 'GENERATING')) {
          return toSnapshotDTO(race);
        }
        snapshotRow = await prisma.aIIntelligenceSnapshot.update({
          where: { id: race.id },
          data: { status: 'GENERATING', errorMessage: null }
        });
      }
    }

    try {
      const signals = await intelligenceAggregationService.collect(userId, projectId ?? null, periodStart, periodEnd);
      const { summary, usedLLM } = await intelligenceGenerationService.generateNarrative(signals, type);

      const maxInsights = await configService.getNumber('AI_INTELLIGENCE_MAX_INSIGHTS', 50);
      await this.createInsightsFromSignals(userId, projectId ?? null, snapshotRow.id, signals, maxInsights);

      const updated = await prisma.aIIntelligenceSnapshot.update({
        where: { id: snapshotRow.id },
        data: {
          status: 'READY',
          summary,
          structuredData: signals as unknown as object,
          modelProvider: usedLLM ? 'llm-gateway' : null,
          modelName: usedLLM ? 'intelligence-narrative' : null,
          generatedAt: now,
          expiresAt: computeExpiresAt(type, periodEnd)
        }
      });

      const dto = toSnapshotDTO(updated);
      const { periodKey } = computePeriod(type, now);
      const cacheKey = aiIntelligenceCacheService.buildCacheKey(userId, projectId ?? null, type, periodKey);
      await aiIntelligenceCacheService.set(cacheKey, dto);

      return dto;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const failed = await prisma.aIIntelligenceSnapshot.update({
        where: { id: snapshotRow.id },
        data: { status: 'FAILED', errorMessage }
      });
      return toSnapshotDTO(failed);
    }
  }

  public async getPreferences(userId: string): Promise<PreferenceDTO> {
    const row = await prisma.aIIntelligencePreference.findUnique({ where: { userId } });
    if (!row) {
      // Design decision: do NOT auto-create a preference row on every read — only materialize a
      // real row lazily, on the first PATCH. A read with no row simply returns the schema defaults.
      return { dailyEnabled: true, weeklyEnabled: true, preferredHour: 8, timezone: 'UTC', deliveryMode: 'IN_APP' };
    }
    return {
      dailyEnabled: row.dailyEnabled,
      weeklyEnabled: row.weeklyEnabled,
      preferredHour: row.preferredHour,
      timezone: row.timezone,
      deliveryMode: row.deliveryMode
    };
  }

  public async updatePreferences(userId: string, patch: Partial<PreferenceDTO>): Promise<PreferenceDTO> {
    if (patch.preferredHour !== undefined) {
      if (!Number.isInteger(patch.preferredHour) || patch.preferredHour < 0 || patch.preferredHour > 23) {
        throw new ValidationError('preferredHour must be an integer between 0 and 23.');
      }
    }
    if (patch.timezone !== undefined && (typeof patch.timezone !== 'string' || patch.timezone.trim().length === 0)) {
      throw new ValidationError('timezone must be a non-empty string.');
    }
    if (patch.deliveryMode !== undefined && (typeof patch.deliveryMode !== 'string' || patch.deliveryMode.trim().length === 0)) {
      throw new ValidationError('deliveryMode must be a non-empty string.');
    }
    if (patch.dailyEnabled !== undefined && typeof patch.dailyEnabled !== 'boolean') {
      throw new ValidationError('dailyEnabled must be a boolean.');
    }
    if (patch.weeklyEnabled !== undefined && typeof patch.weeklyEnabled !== 'boolean') {
      throw new ValidationError('weeklyEnabled must be a boolean.');
    }

    const row = await prisma.aIIntelligencePreference.upsert({
      where: { userId },
      create: {
        userId,
        dailyEnabled: patch.dailyEnabled ?? true,
        weeklyEnabled: patch.weeklyEnabled ?? true,
        preferredHour: patch.preferredHour ?? 8,
        timezone: patch.timezone ?? 'UTC',
        deliveryMode: patch.deliveryMode ?? 'IN_APP'
      },
      update: {
        ...(patch.dailyEnabled !== undefined ? { dailyEnabled: patch.dailyEnabled } : {}),
        ...(patch.weeklyEnabled !== undefined ? { weeklyEnabled: patch.weeklyEnabled } : {}),
        ...(patch.preferredHour !== undefined ? { preferredHour: patch.preferredHour } : {}),
        ...(patch.timezone !== undefined ? { timezone: patch.timezone } : {}),
        ...(patch.deliveryMode !== undefined ? { deliveryMode: patch.deliveryMode } : {})
      }
    });

    await auditService.logEvent({
      actorId: userId,
      action: 'AI_INTELLIGENCE_PREFERENCES_UPDATED',
      targetType: 'AI_INTELLIGENCE_PREFERENCE',
      targetId: row.id,
      details: { patch }
    });

    return {
      dailyEnabled: row.dailyEnabled,
      weeklyEnabled: row.weeklyEnabled,
      preferredHour: row.preferredHour,
      timezone: row.timezone,
      deliveryMode: row.deliveryMode
    };
  }

  /**
   * Creates new, durable, reviewable IntelligenceInsight rows for signal categories worth
   * surfacing beyond the snapshot narrative itself — bounded by maxInsights, deduped against
   * already-open insights for the same (userId, projectId, type, sourceId) combo (mirroring
   * risk-blocker-detection.service.ts's dedupe-by-metadata-key style) so re-running generation
   * never spams duplicates. Every evidence sourceId traces back to a real signal's sourceId
   * (itself always a real looked-up Meeting/Document/MeetingTaskSuggestion/Insight id).
   */
  private async createInsightsFromSignals(
    userId: string,
    projectId: string | null,
    snapshotId: string,
    signals: AggregatedSignals,
    maxInsights: number
  ): Promise<void> {
    const plans: InsightCategoryPlan[] = [
      {
        type: 'KNOWLEDGE_CHANGE',
        claimType: 'INFERENCE',
        items: signals.knowledgeChanges,
        titlePrefix: 'Knowledge change',
        sourceType: 'INTELLIGENCE_INSIGHT'
      },
      {
        type: 'MEETING_FOLLOWUP',
        claimType: 'RECOMMENDATION',
        items: signals.recentMeetings,
        titlePrefix: 'Meeting may need follow-up',
        sourceType: 'MEETING'
      },
      {
        type: 'TASK',
        claimType: 'FACT',
        items: signals.overdueTasks,
        titlePrefix: 'Overdue task',
        sourceType: 'TASK'
      },
      {
        type: 'DECISION',
        claimType: 'FACT',
        items: signals.decisions,
        titlePrefix: 'Decision captured',
        sourceType: 'MEETING'
      }
    ];

    // Dedupe against already-open insights for this (userId, projectId, type, sourceId).
    const existingByType = await prisma.intelligenceInsight.findMany({
      where: {
        userId,
        projectId: projectId ?? undefined,
        type: { in: plans.map((p) => p.type) },
        status: { in: ['NEW', 'UNDER_REVIEW', 'CONFIRMED'] }
      },
      select: { type: true, metadata: true }
    });
    const existingKeys = new Set(
      existingByType.map((i) => {
        const m = (i.metadata as Record<string, unknown> | null) ?? {};
        return `${i.type}::${String(m.sourceId ?? '')}`;
      })
    );

    let created = 0;
    for (const plan of plans) {
      for (const item of plan.items) {
        if (created >= maxInsights) return;
        const key = `${plan.type}::${item.sourceId}`;
        if (existingKeys.has(key)) continue;

        const confidence = evaluateConfidence(plan.claimType === 'FACT' ? 0.85 : plan.claimType === 'RECOMMENDATION' ? 0.55 : 0.6, [
          `Derived from AI Workspace Intelligence snapshot ${snapshotId}`
        ]);

        try {
          // Direct prisma.intelligenceInsight.create (never insightRepository) — see the import
          // note above: this keeps the ai-intelligence module's dependency graph worker-safe,
          // mirroring risk-blocker-detection.service.ts's own direct-prisma style. Every evidence
          // sourceId here traces back to a real, already-looked-up row id from `signals`, never
          // a fabricated one.
          await prisma.intelligenceInsight.create({
            data: {
              userId,
              projectId: projectId ?? null,
              type: plan.type,
              severity: 'MEDIUM',
              title: `${plan.titlePrefix}: ${item.title}`.slice(0, 250),
              description: (item.meta?.description as string | undefined) ?? item.title,
              confidenceBand: confidence.band,
              confidenceScore: confidence.score,
              detectionVersion: 'ai-workspace-intelligence-v1',
              metadata: { sourceId: item.sourceId, snapshotId },
              snapshotId,
              claimType: plan.claimType,
              evidence: {
                create: [
                  {
                    sourceType: item.sourceType || plan.sourceType,
                    sourceId: item.sourceId,
                    snippet: item.title.slice(0, 500),
                    sourceTimestamp: new Date(item.timestamp)
                  }
                ]
              }
            }
          });
          existingKeys.add(key);
          created += 1;
        } catch {
          // per-item continue on error, mirroring Phase 78B detectors' style
        }
      }
    }
  }
}

export const aiIntelligenceService = new AiIntelligenceService();
