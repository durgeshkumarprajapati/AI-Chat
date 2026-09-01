jest.mock('@/lib/prisma', () => ({
  prisma: {
    copilotMemory: { findMany: jest.fn(), updateMany: jest.fn() },
    memorySettings: { findUnique: jest.fn() }
  }
}));
jest.mock('@/lib/redis', () => ({
  redis: { getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn(), del: jest.fn(), delByPattern: jest.fn() }
}));
jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn().mockResolvedValue(true), getNumber: jest.fn((_k: string, d: number) => Promise.resolve(d)) }
}));

import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { copilotMemoryService } from '@/features/copilot/memory/copilot-memory.service';
import { memoryRetrievalCacheService } from '@/features/copilot/cache/memory-retrieval-cache.service';

function row(id: string) {
  return {
    id,
    userId: 'user-a',
    projectId: null,
    category: 'USER_PREFERENCE',
    key: `k-${id}`,
    value: `v-${id}`,
    confidence: 0.9,
    source: 'user_explicit',
    importance: 0.9,
    sourceType: null,
    sourceId: null,
    lastUsedAt: new Date(),
    accessCount: 0,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

describe('Phase 90 — Performance budget: bounded results and a bounded timeout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    memoryRetrievalCacheService.clearInMemoryCache();
    (prisma.memorySettings.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.copilotMemory.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
  });

  it('never returns more than AI_MEMORY_MAX_RETRIEVAL_RESULTS even when the DB returns far more candidates', async () => {
    (configService.getNumber as jest.Mock).mockImplementation((key: string, def: number) => {
      if (key === 'AI_MEMORY_MAX_RETRIEVAL_RESULTS') return Promise.resolve(3);
      return Promise.resolve(def);
    });
    const manyRows = Array.from({ length: 50 }, (_, i) => row(`m${i}`));
    (prisma.copilotMemory.findMany as jest.Mock).mockResolvedValue(manyRows);

    const result = await copilotMemoryService.retrieveRankedMemories('user-a', {});

    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('queries a bounded candidate pool (maxResults * 3), never an unbounded scan', async () => {
    (configService.getNumber as jest.Mock).mockImplementation((key: string, def: number) => {
      if (key === 'AI_MEMORY_MAX_RETRIEVAL_RESULTS') return Promise.resolve(5);
      return Promise.resolve(def);
    });
    (prisma.copilotMemory.findMany as jest.Mock).mockResolvedValue([]);

    await copilotMemoryService.retrieveRankedMemories('user-a', {});

    const callArgs = (prisma.copilotMemory.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.take).toBe(15);
  });

  it('resolves to [] promptly (never hangs) when the DB call never resolves, respecting the configured timeout', async () => {
    (configService.getNumber as jest.Mock).mockImplementation((key: string, def: number) => {
      if (key === 'AI_MEMORY_RETRIEVAL_TIMEOUT_MS') return Promise.resolve(50);
      return Promise.resolve(def);
    });
    // A DB call that never resolves, simulating a hang.
    (prisma.copilotMemory.findMany as jest.Mock).mockImplementation(() => new Promise(() => {}));

    const startedAt = Date.now();
    const result = await copilotMemoryService.retrieveRankedMemories('user-a', {});
    const elapsedMs = Date.now() - startedAt;

    expect(result).toEqual([]);
    expect(elapsedMs).toBeLessThan(1000); // well under the test's own 5s timeout — proves it didn't hang
  });

  it('resolves to [] when the DB call rejects outright (never throws out of retrieveRankedMemories)', async () => {
    (prisma.copilotMemory.findMany as jest.Mock).mockRejectedValue(new Error('db exploded'));

    await expect(copilotMemoryService.retrieveRankedMemories('user-a', {})).resolves.toEqual([]);
  });
});
