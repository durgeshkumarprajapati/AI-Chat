jest.mock('@/lib/redis', () => ({
  redis: { getJson: jest.fn(), setJson: jest.fn(), del: jest.fn() }
}));
jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn(), getNumber: jest.fn().mockResolvedValue(300) }
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    aIIntelligenceSnapshot: { findFirst: jest.fn() }
  }
}));
jest.mock('@/features/projects/project-authorization.service', () => ({
  projectAuthorizationService: { authorizeProjectAccess: jest.fn().mockResolvedValue(undefined) }
}));

import { redis } from '@/lib/redis';
import { prisma } from '@/lib/prisma';
import { aiIntelligenceCacheService } from '@/features/ai-intelligence/cache/ai-intelligence-cache.service';
import { aiIntelligenceService } from '@/features/ai-intelligence/services/ai-intelligence.service';
import { SnapshotDTO } from '@/features/ai-intelligence/types/ai-intelligence.types';

const SAMPLE_DTO: SnapshotDTO = {
  id: 'snap-1',
  type: 'DAILY',
  status: 'READY',
  periodStart: new Date().toISOString(),
  periodEnd: new Date(Date.now() + 86400000).toISOString(),
  summary: 'cached summary',
  structuredData: {},
  generatedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
  usedLLM: false,
  createdAt: new Date().toISOString()
};

describe('Phase 85 — cache: key isolation, hit-skips-DB, Redis-outage fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    aiIntelligenceCacheService.clearInMemoryCache();
  });

  it('buildCacheKey differs across different users (same project/type/period)', () => {
    const k1 = aiIntelligenceCacheService.buildCacheKey('user-a', 'proj-1', 'DAILY', '2026-08-31');
    const k2 = aiIntelligenceCacheService.buildCacheKey('user-b', 'proj-1', 'DAILY', '2026-08-31');
    expect(k1).not.toBe(k2);
  });

  it('buildCacheKey differs across different projects (same user/type/period), and null vs a project id', () => {
    const k1 = aiIntelligenceCacheService.buildCacheKey('user-a', 'proj-1', 'DAILY', '2026-08-31');
    const k2 = aiIntelligenceCacheService.buildCacheKey('user-a', 'proj-2', 'DAILY', '2026-08-31');
    const k3 = aiIntelligenceCacheService.buildCacheKey('user-a', null, 'DAILY', '2026-08-31');
    expect(new Set([k1, k2, k3]).size).toBe(3);
  });

  it('buildCacheKey differs across DAILY vs WEEKLY (same user/project/period)', () => {
    const k1 = aiIntelligenceCacheService.buildCacheKey('user-a', null, 'DAILY', '2026-08-31');
    const k2 = aiIntelligenceCacheService.buildCacheKey('user-a', null, 'WEEKLY', '2026-08-31');
    expect(k1).not.toBe(k2);
  });

  it('buildCacheKey differs across different period keys', () => {
    const k1 = aiIntelligenceCacheService.buildCacheKey('user-a', null, 'DAILY', '2026-08-31');
    const k2 = aiIntelligenceCacheService.buildCacheKey('user-a', null, 'DAILY', '2026-09-01');
    expect(k1).not.toBe(k2);
  });

  it('a cache hit on getSnapshot skips the DB query entirely', async () => {
    (redis.getJson as jest.Mock).mockResolvedValue(SAMPLE_DTO);

    const result = await aiIntelligenceService.getSnapshot('user-1', 'DAILY', null);

    expect(result).toEqual(SAMPLE_DTO);
    expect(prisma.aIIntelligenceSnapshot.findFirst).not.toHaveBeenCalled();
  });

  it('a Redis outage (getJson/setJson throwing) still returns the correct DB-backed result via the in-memory/DB fallback, never crashing', async () => {
    (redis.getJson as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));
    (redis.setJson as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

    const dbRow = {
      id: 'snap-db',
      userId: 'user-1',
      projectId: null,
      type: 'DAILY',
      status: 'READY',
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 86400000),
      summary: 'db summary',
      structuredData: {},
      modelProvider: null,
      modelName: null,
      generatedAt: new Date(),
      expiresAt: new Date(),
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    (prisma.aIIntelligenceSnapshot.findFirst as jest.Mock).mockResolvedValue(dbRow);

    const result = await aiIntelligenceService.getSnapshot('user-1', 'DAILY', null);

    expect(result?.summary).toBe('db summary');
    expect(prisma.aIIntelligenceSnapshot.findFirst).toHaveBeenCalledTimes(1);
  });

  it('AiIntelligenceCacheService.get falls back to the in-memory store when redis.getJson throws (set still populates it)', async () => {
    (redis.getJson as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));
    (redis.setJson as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

    await aiIntelligenceCacheService.set('ai:intelligence:v1:test-key', SAMPLE_DTO, 60);
    const val = await aiIntelligenceCacheService.get('ai:intelligence:v1:test-key');

    expect(val).toEqual(SAMPLE_DTO);
  });
});
