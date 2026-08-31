jest.mock('@/lib/prisma', () => ({
  prisma: {
    aIIntelligenceSnapshot: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    intelligenceInsight: { findMany: jest.fn(), create: jest.fn() }
  }
}));
jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn().mockResolvedValue(true), getNumber: jest.fn().mockResolvedValue(50) }
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
import { intelligenceAggregationService } from '@/features/ai-intelligence/aggregation/intelligence-aggregation.service';
import { intelligenceGenerationService } from '@/features/ai-intelligence/generation/intelligence-generation.service';
import { aiIntelligenceService } from '@/features/ai-intelligence/services/ai-intelligence.service';
import { AggregatedSignals } from '@/features/ai-intelligence/types/ai-intelligence.types';

function emptySignals(): AggregatedSignals {
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
    truncated: false
  };
}

/** In-memory fake for AIIntelligenceSnapshot rows, so findFirst/create/update behave like a real
 *  single-row table across the two generateSnapshot() calls in each test. */
function installStatefulSnapshotStore() {
  let row: any = null;

  (prisma.aIIntelligenceSnapshot.findFirst as jest.Mock).mockImplementation(async () => row);
  (prisma.aIIntelligenceSnapshot.create as jest.Mock).mockImplementation(async ({ data }: any) => {
    row = { id: 'snap-1', createdAt: new Date(), updatedAt: new Date(), ...data };
    return row;
  });
  (prisma.aIIntelligenceSnapshot.update as jest.Mock).mockImplementation(async ({ data }: any) => {
    row = { ...row, ...data };
    return row;
  });

  return () => row;
}

describe('Phase 85 — idempotency: generateSnapshot never double-generates for the same period', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.intelligenceInsight.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.intelligenceInsight.create as jest.Mock).mockResolvedValue({ id: 'insight-1' });
    (intelligenceAggregationService.collect as jest.Mock).mockResolvedValue(emptySignals());
    (intelligenceGenerationService.generateNarrative as jest.Mock).mockResolvedValue({ summary: 'ok', usedLLM: false });
  });

  it('calling generateSnapshot twice for the same (userId, projectId, type, period) only aggregates/generates once', async () => {
    installStatefulSnapshotStore();

    const first = await aiIntelligenceService.generateSnapshot('user-1', 'DAILY', null);
    const second = await aiIntelligenceService.generateSnapshot('user-1', 'DAILY', null);

    expect(intelligenceAggregationService.collect).toHaveBeenCalledTimes(1);
    expect(intelligenceGenerationService.generateNarrative).toHaveBeenCalledTimes(1);
    expect(first.status).toBe('READY');
    expect(second.status).toBe('READY');
    expect(second.id).toBe(first.id);
  });

  it('a concurrent GENERATING snapshot is returned as-is rather than starting a duplicate generation', async () => {
    (prisma.aIIntelligenceSnapshot.findFirst as jest.Mock).mockResolvedValue({
      id: 'snap-in-flight',
      userId: 'user-1',
      projectId: null,
      type: 'DAILY',
      status: 'GENERATING',
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 86400000),
      summary: null,
      structuredData: {},
      modelProvider: null,
      modelName: null,
      generatedAt: null,
      expiresAt: null,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const result = await aiIntelligenceService.generateSnapshot('user-1', 'DAILY', null);

    expect(result.status).toBe('GENERATING');
    expect(result.id).toBe('snap-in-flight');
    expect(intelligenceAggregationService.collect).not.toHaveBeenCalled();
    expect(intelligenceGenerationService.generateNarrative).not.toHaveBeenCalled();
    expect(prisma.aIIntelligenceSnapshot.create).not.toHaveBeenCalled();
  });

  it('force:true bypasses the early READY return and re-generates (still exactly one aggregation call per invocation)', async () => {
    installStatefulSnapshotStore();

    await aiIntelligenceService.generateSnapshot('user-1', 'DAILY', null);
    await aiIntelligenceService.generateSnapshot('user-1', 'DAILY', null, { force: true });

    expect(intelligenceAggregationService.collect).toHaveBeenCalledTimes(2);
  });
});
