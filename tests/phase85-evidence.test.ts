jest.mock('@/lib/prisma', () => ({
  prisma: {
    aIIntelligenceSnapshot: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    intelligenceInsight: { findMany: jest.fn(), create: jest.fn() }
  }
}));
jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn(), getNumber: jest.fn() }
}));
jest.mock('@/features/billing/entitlement.service', () => ({
  entitlementService: { requireFeature: jest.fn().mockResolvedValue(undefined) }
}));
jest.mock('@/features/projects/project-authorization.service', () => ({
  projectAuthorizationService: { authorizeProjectAccess: jest.fn().mockResolvedValue(undefined) }
}));
jest.mock('@/features/audit/audit.service', () => ({
  auditService: { logEvent: jest.fn() }
}));
jest.mock('@/features/ai-intelligence/aggregation/intelligence-aggregation.service', () => ({
  intelligenceAggregationService: { collect: jest.fn() }
}));
jest.mock('@/features/ai-intelligence/generation/intelligence-generation.service', () => ({
  intelligenceGenerationService: { generateNarrative: jest.fn() }
}));
jest.mock('@/features/ai-intelligence/cache/ai-intelligence-cache.service', () => ({
  aiIntelligenceCacheService: {
    buildCacheKey: jest.fn(() => 'cache-key'),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined)
  }
}));

import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { intelligenceAggregationService } from '@/features/ai-intelligence/aggregation/intelligence-aggregation.service';
import { intelligenceGenerationService } from '@/features/ai-intelligence/generation/intelligence-generation.service';
import { aiIntelligenceService } from '@/features/ai-intelligence/services/ai-intelligence.service';
import { AggregatedSignals } from '@/features/ai-intelligence/types/ai-intelligence.types';

function emptySignals(overrides: Partial<AggregatedSignals> = {}): AggregatedSignals {
  return {
    userId: 'user-1',
    projectId: null,
    periodStart: new Date().toISOString(),
    periodEnd: new Date().toISOString(),
    overdueTasks: [],
    dueSoonTasks: [],
    recentMeetings: [],
    decisions: [],
    actionItems: [],
    recentDocumentChanges: [],
    knowledgeChanges: [],
    risks: [],
    blockers: [],
    deadlineRisks: [],
    taskMeetingMismatches: [],
    projectHealthSummaries: [],
    truncated: false,
    ...overrides
  };
}

describe('Phase 85 — evidence integrity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (configService.getBoolean as jest.Mock).mockResolvedValue(true);
    (configService.getNumber as jest.Mock).mockResolvedValue(50);
    (prisma.aIIntelligenceSnapshot.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.aIIntelligenceSnapshot.create as jest.Mock).mockImplementation(async ({ data }: any) => ({
      id: 'snap-1',
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
    (prisma.aIIntelligenceSnapshot.update as jest.Mock).mockImplementation(async ({ where, data }: any) => ({
      id: where.id,
      userId: 'user-1',
      projectId: null,
      type: 'DAILY',
      periodStart: new Date(),
      periodEnd: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data
    }));
    (prisma.intelligenceInsight.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.intelligenceInsight.create as jest.Mock).mockResolvedValue({ id: 'insight-created' });
    (intelligenceGenerationService.generateNarrative as jest.Mock).mockResolvedValue({ summary: 'ok', usedLLM: false });
  });

  it('every created insight\'s evidence sourceId traces to a real signal sourceId — never invented', async () => {
    (intelligenceAggregationService.collect as jest.Mock).mockResolvedValue(
      emptySignals({
        overdueTasks: [
          { id: 'task-real-id', title: 'Finish report', sourceType: 'TASK', sourceId: 'task-real-id', timestamp: new Date().toISOString() }
        ],
        recentMeetings: [
          { id: 'meeting-real-id', title: 'Standup', sourceType: 'MEETING', sourceId: 'meeting-real-id', timestamp: new Date().toISOString() }
        ]
      })
    );

    await aiIntelligenceService.generateSnapshot('user-1', 'DAILY', null);

    const creates = (prisma.intelligenceInsight.create as jest.Mock).mock.calls.map((c) => c[0].data);
    expect(creates.length).toBe(2);

    for (const created of creates) {
      const evidence = created.evidence.create[0];
      // The sourceId must exactly equal one of the real ids handed in via `signals` — never a
      // fabricated or randomly-generated id.
      expect(['task-real-id', 'meeting-real-id']).toContain(evidence.sourceId);
      expect(created.snapshotId).toBe('snap-1');
    }
  });

  it('evidence sourceType is preserved from the signal (TASK/MEETING), never defaulted to something unrelated', async () => {
    (intelligenceAggregationService.collect as jest.Mock).mockResolvedValue(
      emptySignals({
        overdueTasks: [{ id: 't1', title: 'Task', sourceType: 'TASK', sourceId: 'task-1', timestamp: new Date().toISOString() }]
      })
    );

    await aiIntelligenceService.generateSnapshot('user-1', 'DAILY', null);

    const call = (prisma.intelligenceInsight.create as jest.Mock).mock.calls[0][0];
    expect(call.data.evidence.create[0].sourceType).toBe('TASK');
  });

  it('when no signals exist in any category, no insight is created at all (nothing to fabricate evidence for)', async () => {
    (intelligenceAggregationService.collect as jest.Mock).mockResolvedValue(emptySignals());

    await aiIntelligenceService.generateSnapshot('user-1', 'DAILY', null);

    expect(prisma.intelligenceInsight.create).not.toHaveBeenCalled();
  });

  it('dedupes against an already-open insight for the same (type, sourceId) — never creates a duplicate on re-run', async () => {
    (intelligenceAggregationService.collect as jest.Mock).mockResolvedValue(
      emptySignals({
        overdueTasks: [{ id: 't1', title: 'Task', sourceType: 'TASK', sourceId: 'task-dup', timestamp: new Date().toISOString() }]
      })
    );
    (prisma.intelligenceInsight.findMany as jest.Mock).mockResolvedValue([
      { type: 'TASK', metadata: { sourceId: 'task-dup' } }
    ]);

    await aiIntelligenceService.generateSnapshot('user-1', 'DAILY', null);

    expect(prisma.intelligenceInsight.create).not.toHaveBeenCalled();
  });

  it('insight creation is bounded by AI_INTELLIGENCE_MAX_INSIGHTS — never creates more than the configured cap', async () => {
    (configService.getNumber as jest.Mock).mockImplementation((key: string) => {
      if (key === 'AI_INTELLIGENCE_MAX_INSIGHTS') return Promise.resolve(1);
      return Promise.resolve(50);
    });
    (intelligenceAggregationService.collect as jest.Mock).mockResolvedValue(
      emptySignals({
        overdueTasks: [
          { id: 't1', title: 'Task 1', sourceType: 'TASK', sourceId: 'task-1', timestamp: new Date().toISOString() },
          { id: 't2', title: 'Task 2', sourceType: 'TASK', sourceId: 'task-2', timestamp: new Date().toISOString() }
        ]
      })
    );

    await aiIntelligenceService.generateSnapshot('user-1', 'DAILY', null);

    expect(prisma.intelligenceInsight.create).toHaveBeenCalledTimes(1);
  });
});
