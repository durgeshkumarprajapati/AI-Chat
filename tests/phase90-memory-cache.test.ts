jest.mock('@/lib/prisma', () => ({
  prisma: {
    copilotMemory: { findMany: jest.fn(), updateMany: jest.fn() },
    memorySettings: { findUnique: jest.fn() }
  }
}));
jest.mock('@/lib/redis', () => ({
  redis: {
    getJson: jest.fn().mockRejectedValue(new Error('no redis in this test — force the in-memory fallback layer')),
    setJson: jest.fn().mockRejectedValue(new Error('no redis')),
    del: jest.fn(),
    delByPattern: jest.fn().mockRejectedValue(new Error('no redis'))
  }
}));
jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn().mockResolvedValue(true), getNumber: jest.fn((_k: string, d: number) => Promise.resolve(d)) }
}));

import { prisma } from '@/lib/prisma';
import { copilotMemoryService } from '@/features/copilot/memory/copilot-memory.service';
import { memoryRetrievalCacheService } from '@/features/copilot/cache/memory-retrieval-cache.service';

function row(id: string) {
  return {
    id,
    userId: 'user-a',
    projectId: null,
    category: 'USER_PREFERENCE',
    key: 'k',
    value: 'v',
    confidence: 1,
    source: 'user_explicit',
    importance: 0.5,
    sourceType: null,
    sourceId: null,
    lastUsedAt: null,
    accessCount: 0,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

describe('Phase 90 — Memory retrieval cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    memoryRetrievalCacheService.clearInMemoryCache();
    (prisma.memorySettings.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.copilotMemory.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
  });

  it('a cache hit skips the DB entirely on the second identical call', async () => {
    (prisma.copilotMemory.findMany as jest.Mock).mockResolvedValue([row('mem-1')]);

    const first = await copilotMemoryService.retrieveRankedMemories('user-a', { queryText: 'hello' });
    expect(prisma.copilotMemory.findMany).toHaveBeenCalledTimes(1);
    expect(first).toHaveLength(1);

    const second = await copilotMemoryService.retrieveRankedMemories('user-a', { queryText: 'hello' });
    expect(prisma.copilotMemory.findMany).toHaveBeenCalledTimes(1); // still 1 — DB was not hit again
    expect(second).toHaveLength(1);
  });

  it('cache keys differ across users', () => {
    const keyA = memoryRetrievalCacheService.buildCacheKey('user-a', undefined, 'hello');
    const keyB = memoryRetrievalCacheService.buildCacheKey('user-b', undefined, 'hello');
    expect(keyA).not.toBe(keyB);
  });

  it('cache keys differ across projects for the same user/query', () => {
    const keyNoProject = memoryRetrievalCacheService.buildCacheKey('user-a', undefined, 'hello');
    const keyProject1 = memoryRetrievalCacheService.buildCacheKey('user-a', 'project-1', 'hello');
    const keyProject2 = memoryRetrievalCacheService.buildCacheKey('user-a', 'project-2', 'hello');
    expect(new Set([keyNoProject, keyProject1, keyProject2]).size).toBe(3);
  });

  it('cache keys differ across query text for the same user/project', () => {
    const keyOne = memoryRetrievalCacheService.buildCacheKey('user-a', undefined, 'first query');
    const keyTwo = memoryRetrievalCacheService.buildCacheKey('user-a', undefined, 'second query');
    expect(keyOne).not.toBe(keyTwo);
  });

  it('invalidate() clears a user\'s cached entries so the next retrieval re-hits the DB', async () => {
    (prisma.copilotMemory.findMany as jest.Mock).mockResolvedValue([row('mem-1')]);

    await copilotMemoryService.retrieveRankedMemories('user-a', { queryText: 'hello' });
    expect(prisma.copilotMemory.findMany).toHaveBeenCalledTimes(1);

    await memoryRetrievalCacheService.invalidate('user-a');

    await copilotMemoryService.retrieveRankedMemories('user-a', { queryText: 'hello' });
    expect(prisma.copilotMemory.findMany).toHaveBeenCalledTimes(2);
  });
});
