jest.mock('@/lib/prisma', () => ({
  prisma: {
    copilotMemory: { findMany: jest.fn(), updateMany: jest.fn() },
    memorySettings: { findUnique: jest.fn() }
  }
}));
jest.mock('@/lib/redis', () => ({
  redis: { getJson: jest.fn().mockRejectedValue(new Error('no redis')), setJson: jest.fn(), del: jest.fn(), delByPattern: jest.fn() }
}));
jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn().mockResolvedValue(true), getNumber: jest.fn((_k: string, d: number) => Promise.resolve(d)) }
}));

import { prisma } from '@/lib/prisma';
import { copilotMemoryService } from '@/features/copilot/memory/copilot-memory.service';
import { memoryRetrievalCacheService } from '@/features/copilot/cache/memory-retrieval-cache.service';

const NOW = new Date('2024-06-15T00:00:00.000Z');

function makeRow(overrides: Partial<any>) {
  return {
    id: 'id',
    userId: 'user-a',
    projectId: null,
    category: 'USER_PREFERENCE',
    key: 'pref',
    value: 'some preference value',
    confidence: 0.8,
    source: 'user_explicit',
    importance: 0.5,
    sourceType: null,
    sourceId: null,
    lastUsedAt: null,
    accessCount: 0,
    expiresAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

describe('Phase 90 — Ranked-memory retrieval produces deterministic ordering for a fixed input set', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    memoryRetrievalCacheService.clearInMemoryCache();
    jest.useFakeTimers().setSystemTime(NOW);
    (prisma.memorySettings.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.copilotMemory.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('ranks a high recency/importance/confidence/access-count memory above a stale, low-signal one', async () => {
    const strong = makeRow({
      id: 'strong',
      importance: 0.9,
      confidence: 0.95,
      accessCount: 20,
      lastUsedAt: NOW,
      updatedAt: NOW
    });
    const weak = makeRow({
      id: 'weak',
      importance: 0.1,
      confidence: 0.2,
      accessCount: 0,
      lastUsedAt: new Date('2023-01-01T00:00:00.000Z'),
      updatedAt: new Date('2023-01-01T00:00:00.000Z')
    });
    const medium = makeRow({
      id: 'medium',
      importance: 0.5,
      confidence: 0.5,
      accessCount: 3,
      lastUsedAt: new Date('2024-06-01T00:00:00.000Z'),
      updatedAt: new Date('2024-06-01T00:00:00.000Z')
    });

    (prisma.copilotMemory.findMany as jest.Mock).mockResolvedValue([weak, medium, strong]);

    const result = await copilotMemoryService.retrieveRankedMemories('user-a', {});

    expect(result.map((r) => r.id)).toEqual(['strong', 'medium', 'weak']);
    // Scores are monotonically decreasing.
    expect(result[0]!.score).toBeGreaterThan(result[1]!.score);
    expect(result[1]!.score).toBeGreaterThan(result[2]!.score);
  });

  it('boosts a memory whose key/value lexically overlaps the query text above an equally-weighted one that does not', async () => {
    const relevant = makeRow({ id: 'relevant', key: 'editor', value: 'prefers vim keybindings', importance: 0.5, confidence: 0.5 });
    const irrelevant = makeRow({ id: 'irrelevant', key: 'timezone', value: 'lives in UTC+5:30', importance: 0.5, confidence: 0.5 });

    (prisma.copilotMemory.findMany as jest.Mock).mockResolvedValue([irrelevant, relevant]);

    const result = await copilotMemoryService.retrieveRankedMemories('user-a', { queryText: 'what editor keybindings do I like' });

    expect(result[0]!.id).toBe('relevant');
  });

  it('truncates each returned memory value to AI_MEMORY_MAX_CONTENT_LENGTH', async () => {
    const { configService } = require('@/features/config/config.service');
    (configService.getNumber as jest.Mock).mockImplementation((key: string, def: number) => {
      if (key === 'AI_MEMORY_MAX_CONTENT_LENGTH') return Promise.resolve(10);
      return Promise.resolve(def);
    });

    const longRow = makeRow({ id: 'long', value: 'x'.repeat(500) });
    (prisma.copilotMemory.findMany as jest.Mock).mockResolvedValue([longRow]);

    const result = await copilotMemoryService.retrieveRankedMemories('user-a', {});

    expect(result[0]!.value.length).toBeLessThanOrEqual(10);
  });
});
