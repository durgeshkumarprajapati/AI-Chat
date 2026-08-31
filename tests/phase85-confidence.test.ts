// Phase 85 — AI Workspace Intelligence reuses Phase 78's confidence.util directly rather than
// inventing its own separate scale. This file verifies (a) the shared utility's own thresholds
// still hold, and (b) ai-intelligence.service.ts's insight-creation path calls into
// evaluateConfidence and persists whatever band it returns, rather than a locally hand-rolled one.
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
  projectAuthorizationService: { authorizeProjectAccess: jest.fn() }
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

import {
  scoreToConfidenceBand,
  evaluateConfidence,
  clampScore
} from '@/features/knowledge-intelligence/confidence.util';
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

describe('Phase 85 — confidence reuse (no separate scale invented)', () => {
  it('bands scores per the SAME documented thresholds as Phase 78: LOW < 0.5, MEDIUM 0.5-0.75, HIGH > 0.75', () => {
    expect(scoreToConfidenceBand(0.49)).toBe('LOW');
    expect(scoreToConfidenceBand(0.5)).toBe('MEDIUM');
    expect(scoreToConfidenceBand(0.75)).toBe('MEDIUM');
    expect(scoreToConfidenceBand(0.751)).toBe('HIGH');
  });

  it('clamps out-of-range scores exactly like Phase 78 does', () => {
    expect(clampScore(2)).toBe(1);
    expect(clampScore(-2)).toBe(0);
  });

  it('evaluateConfidence bundles score/band/factors consistently (same shape Phase 78 relies on)', () => {
    const result = evaluateConfidence(0.85, ['test factor']);
    expect(result.band).toBe('HIGH');
    expect(result.factors).toEqual(['test factor']);
  });

  describe('ai-intelligence.service.ts applies evaluateConfidence output to created insights', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      (configService.getBoolean as jest.Mock).mockImplementation((key: string, def: boolean) => {
        if (key === 'AI_INTELLIGENCE_ENABLED') return Promise.resolve(true);
        if (key === 'AI_DAILY_INTELLIGENCE_ENABLED') return Promise.resolve(true);
        if (key === 'AI_WEEKLY_INTELLIGENCE_ENABLED') return Promise.resolve(true);
        return Promise.resolve(def);
      });
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
      (prisma.intelligenceInsight.create as jest.Mock).mockResolvedValue({ id: 'insight-1' });
      (intelligenceGenerationService.generateNarrative as jest.Mock).mockResolvedValue({ summary: 'ok', usedLLM: false });
    });

    it('a TASK (FACT claim, score 0.85) is persisted with the HIGH band evaluateConfidence(0.85) produces', async () => {
      (intelligenceAggregationService.collect as jest.Mock).mockResolvedValue(
        emptySignals({
          overdueTasks: [{ id: 't1', title: 'Ship report', sourceType: 'TASK', sourceId: 'task-1', timestamp: new Date().toISOString() }]
        })
      );

      await aiIntelligenceService.generateSnapshot('user-1', 'DAILY', null);

      const call = (prisma.intelligenceInsight.create as jest.Mock).mock.calls.find((c) => c[0].data.type === 'TASK');
      expect(call).toBeDefined();
      expect(call![0].data.confidenceBand).toBe(evaluateConfidence(0.85).band);
      expect(call![0].data.confidenceBand).toBe('HIGH');
    });

    it('a MEETING_FOLLOWUP (RECOMMENDATION claim, score 0.55) is persisted with the MEDIUM band evaluateConfidence(0.55) produces', async () => {
      (intelligenceAggregationService.collect as jest.Mock).mockResolvedValue(
        emptySignals({
          recentMeetings: [{ id: 'm1', title: 'Sync', sourceType: 'MEETING', sourceId: 'meeting-1', timestamp: new Date().toISOString() }]
        })
      );

      await aiIntelligenceService.generateSnapshot('user-1', 'DAILY', null);

      const call = (prisma.intelligenceInsight.create as jest.Mock).mock.calls.find((c) => c[0].data.type === 'MEETING_FOLLOWUP');
      expect(call).toBeDefined();
      expect(call![0].data.confidenceBand).toBe(evaluateConfidence(0.55).band);
      expect(call![0].data.confidenceBand).toBe('MEDIUM');
    });
  });
});
