jest.mock('@/lib/prisma', () => ({
  prisma: {
    aIIntelligenceSnapshot: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    intelligenceInsight: { findMany: jest.fn(), create: jest.fn() }
  }
}));
jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn(), getNumber: jest.fn().mockResolvedValue(50) }
}));
jest.mock('@/features/billing/entitlement.service', () => ({
  entitlementService: { requireFeature: jest.fn() }
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
import { entitlementService } from '@/features/billing/entitlement.service';
import { intelligenceAggregationService } from '@/features/ai-intelligence/aggregation/intelligence-aggregation.service';
import { intelligenceGenerationService } from '@/features/ai-intelligence/generation/intelligence-generation.service';
import { aiIntelligenceService } from '@/features/ai-intelligence/services/ai-intelligence.service';
import { AuthorizationError, ValidationError } from '@/errors';

describe('Phase 85 — entitlement gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Stateful fake row so update() merges onto whatever create() produced (a real Prisma
    // `update` returns the full row, including columns the update itself didn't touch — a naive
    // mock that only spreads `data` would lose periodStart/periodEnd and break toSnapshotDTO).
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
    (prisma.intelligenceInsight.findMany as jest.Mock).mockResolvedValue([]);
    (intelligenceGenerationService.generateNarrative as jest.Mock).mockResolvedValue({ summary: 'ok', usedLLM: false });
  });

  it('BILLING_ENABLED=false: requireFeature always resolves (soft gate), generation proceeds normally', async () => {
    (entitlementService.requireFeature as jest.Mock).mockResolvedValue(undefined);
    (configService.getBoolean as jest.Mock).mockResolvedValue(true);
    (intelligenceAggregationService.collect as jest.Mock).mockResolvedValue({
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
    });

    const result = await aiIntelligenceService.generateSnapshot('user-1', 'DAILY', null);

    expect(entitlementService.requireFeature).toHaveBeenCalledWith('user-1', 'AI_WORKSPACE_INTELLIGENCE');
    expect(result.status).toBe('READY');
  });

  it('AI_INTELLIGENCE_ENABLED=false: refused before any DB/LLM work — zero aggregation calls, zero snapshot lookups', async () => {
    (entitlementService.requireFeature as jest.Mock).mockResolvedValue(undefined);
    (configService.getBoolean as jest.Mock).mockImplementation((key: string) => {
      if (key === 'AI_INTELLIGENCE_ENABLED') return Promise.resolve(false);
      return Promise.resolve(true);
    });

    await expect(aiIntelligenceService.generateSnapshot('user-1', 'DAILY', null)).rejects.toThrow(ValidationError);

    expect(intelligenceAggregationService.collect).not.toHaveBeenCalled();
    expect(prisma.aIIntelligenceSnapshot.findFirst).not.toHaveBeenCalled();
    expect(prisma.aIIntelligenceSnapshot.create).not.toHaveBeenCalled();
  });

  it('AI_DAILY_INTELLIGENCE_ENABLED=false refuses only DAILY generation (subordinate flag)', async () => {
    (entitlementService.requireFeature as jest.Mock).mockResolvedValue(undefined);
    (configService.getBoolean as jest.Mock).mockImplementation((key: string) => {
      if (key === 'AI_INTELLIGENCE_ENABLED') return Promise.resolve(true);
      if (key === 'AI_DAILY_INTELLIGENCE_ENABLED') return Promise.resolve(false);
      return Promise.resolve(true);
    });

    await expect(aiIntelligenceService.generateSnapshot('user-1', 'DAILY', null)).rejects.toThrow(ValidationError);
    expect(intelligenceAggregationService.collect).not.toHaveBeenCalled();
  });

  it('billing-enabled + plan lacking the feature: entitlementService.requireFeature rejects with a clean AuthorizationError, no downstream work happens', async () => {
    (entitlementService.requireFeature as jest.Mock).mockRejectedValue(
      new AuthorizationError('This feature is available on a higher plan. Current plan: FREE.')
    );

    await expect(aiIntelligenceService.generateSnapshot('user-1', 'DAILY', null)).rejects.toThrow(AuthorizationError);

    expect(intelligenceAggregationService.collect).not.toHaveBeenCalled();
    expect(prisma.aIIntelligenceSnapshot.findFirst).not.toHaveBeenCalled();
  });
});
