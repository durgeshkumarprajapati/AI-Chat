jest.mock('@/lib/prisma', () => ({
  prisma: {
    copilotMemory: { upsert: jest.fn() }
  }
}));
jest.mock('@/lib/redis', () => ({
  redis: { getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn(), del: jest.fn(), delByPattern: jest.fn().mockResolvedValue(0) }
}));
jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn().mockResolvedValue(true), getNumber: jest.fn((_k: string, d: number) => Promise.resolve(d)) }
}));

import { prisma } from '@/lib/prisma';
import { copilotMemoryService } from '@/features/copilot/memory/copilot-memory.service';

describe('Phase 90 — Candidate deduplication via the existing @@unique([userId, key, projectId]) constraint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('two near-duplicate phrasings of the same fact normalize to the same dedup key', async () => {
    (prisma.copilotMemory.upsert as jest.Mock).mockResolvedValue({ id: 'mem-1' });

    await copilotMemoryService.recordMemoryCandidate({
      userId: 'user-a',
      category: 'USER_PREFERENCE',
      content: 'I prefer dark mode for the editor',
      sourceType: 'assistant_conversation'
    });
    await copilotMemoryService.recordMemoryCandidate({
      userId: 'user-a',
      category: 'USER_PREFERENCE',
      content: '  I   Prefer Dark Mode For The Editor!!  ',
      sourceType: 'assistant_conversation'
    });

    const firstKey = (prisma.copilotMemory.upsert as jest.Mock).mock.calls[0][0].where.userId_key_projectId.key;
    const secondKey = (prisma.copilotMemory.upsert as jest.Mock).mock.calls[1][0].where.userId_key_projectId.key;
    expect(firstKey).toBe(secondKey);
  });

  it('a P2002 unique-constraint violation on redelivery is treated as success, producing exactly one logical row', async () => {
    (prisma.copilotMemory.upsert as jest.Mock)
      .mockResolvedValueOnce({ id: 'mem-1' })
      .mockRejectedValueOnce(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));

    const first = await copilotMemoryService.recordMemoryCandidate({
      userId: 'user-a',
      category: 'USER_PREFERENCE',
      content: 'I always use tabs, not spaces',
      sourceType: 'assistant_conversation'
    });
    const second = await copilotMemoryService.recordMemoryCandidate({
      userId: 'user-a',
      category: 'USER_PREFERENCE',
      content: 'I always use tabs, not spaces',
      sourceType: 'assistant_conversation'
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(true); // P2002 treated as success, not an error
    expect(prisma.copilotMemory.upsert).toHaveBeenCalledTimes(2);
  });

  it('a non-P2002 error still propagates (never silently swallowed)', async () => {
    (prisma.copilotMemory.upsert as jest.Mock).mockRejectedValue(new Error('connection lost'));

    await expect(
      copilotMemoryService.recordMemoryCandidate({
        userId: 'user-a',
        category: 'USER_PREFERENCE',
        content: 'some genuine preference statement',
        sourceType: 'assistant_conversation'
      })
    ).rejects.toThrow('connection lost');
  });

  it('rejects a candidate whose content matches a secret-key pattern, storing nothing', async () => {
    const result = await copilotMemoryService.recordMemoryCandidate({
      userId: 'user-a',
      category: 'TECHNICAL_DECISION',
      content: 'our api_key is abc123supersecret',
      sourceType: 'assistant_conversation'
    });

    expect(result.created).toBe(false);
    expect(prisma.copilotMemory.upsert).not.toHaveBeenCalled();
  });
});
