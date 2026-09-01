jest.mock('@/lib/prisma', () => ({
  prisma: {
    copilotMemory: { deleteMany: jest.fn() }
  }
}));
jest.mock('@/lib/redis', () => ({
  redis: { getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn(), del: jest.fn(), delByPattern: jest.fn().mockResolvedValue(0) }
}));

import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { copilotMemoryService } from '@/features/copilot/memory/copilot-memory.service';

describe('Phase 90 — Deleting a memory invalidates the retrieval cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.copilotMemory.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  it('deleteMemory invalidates the user\'s cache via redis.delByPattern', async () => {
    await copilotMemoryService.deleteMemory('mem-1', 'user-a');

    expect(redis.delByPattern).toHaveBeenCalledWith(expect.stringContaining('copilot:memory:v1:user:user-a'));
  });

  it('a cache-invalidation (Redis) failure never throws out of deleteMemory', async () => {
    (redis.delByPattern as jest.Mock).mockRejectedValue(new Error('redis down'));

    await expect(copilotMemoryService.deleteMemory('mem-1', 'user-a')).resolves.toBeUndefined();
  });
});
