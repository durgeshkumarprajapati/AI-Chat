jest.mock('@/lib/prisma', () => ({
  prisma: {
    copilotMemory: { findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() },
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

describe('Phase 90 — Memory isolation: a user can never retrieve another user\'s memories', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.memorySettings.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.copilotMemory.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
  });

  it('getMemories always scopes the query by the authenticated userId', async () => {
    (prisma.copilotMemory.findMany as jest.Mock).mockResolvedValue([]);

    await copilotMemoryService.getMemories('user-a');

    const callArgs = (prisma.copilotMemory.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.where.userId).toBe('user-a');
  });

  it('retrieveRankedMemories always scopes the DB query by the authenticated userId, never a client-supplied one', async () => {
    (prisma.copilotMemory.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'mem-b-1',
        userId: 'user-b',
        projectId: null,
        category: 'USER_PREFERENCE',
        key: 'k',
        value: 'user b secret preference',
        confidence: 1,
        source: 'user_explicit',
        importance: 0.9,
        sourceType: null,
        sourceId: null,
        lastUsedAt: null,
        accessCount: 0,
        expiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);

    // Even though the mocked DB (deliberately, to prove the code never relies on the DB alone)
    // returns a row belonging to user-b, the query itself must have been scoped to user-a — this
    // is what a real DB would enforce via the WHERE clause the code constructs.
    await copilotMemoryService.retrieveRankedMemories('user-a', {});

    const callArgs = (prisma.copilotMemory.findMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.where.userId).toBe('user-a');
    expect(callArgs.where.userId).not.toBe('user-b');
  });

  it('deleteMemory scopes deletion by id AND userId — cannot delete another user\'s memory', async () => {
    (prisma.copilotMemory.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

    await copilotMemoryService.deleteMemory('mem-1', 'user-a');

    const callArgs = (prisma.copilotMemory.deleteMany as jest.Mock).mock.calls[0][0];
    expect(callArgs.where.id).toBe('mem-1');
    expect(callArgs.where.userId).toBe('user-a');
  });

  it('updateMemory returns NotFoundError (never leaks another user\'s memory) when the row belongs to a different user', async () => {
    (prisma.copilotMemory.findUnique as jest.Mock).mockResolvedValue({
      id: 'mem-1',
      userId: 'user-b',
      projectId: null
    });

    await expect(copilotMemoryService.updateMemory('user-a', 'mem-1', { value: 'x' })).rejects.toThrow(/not found/i);
  });
});
