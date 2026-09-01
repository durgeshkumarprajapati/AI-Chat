jest.mock('@/lib/prisma', () => ({
  prisma: {
    copilotMemory: { deleteMany: jest.fn() }
  }
}));
jest.mock('@/lib/redis', () => ({
  redis: { getJson: jest.fn().mockResolvedValue(null), setJson: jest.fn(), del: jest.fn(), delByPattern: jest.fn().mockResolvedValue(0) }
}));
jest.mock('@/features/audit/audit.service', () => ({
  auditService: { logEvent: jest.fn().mockResolvedValue(undefined) }
}));
jest.mock('@/features/projects/project-authorization.service', () => ({
  projectAuthorizationService: { authorizeProjectAccess: jest.fn().mockResolvedValue('OWNER') }
}));
jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn().mockResolvedValue(true), getNumber: jest.fn((_k: string, d: number) => Promise.resolve(d)) }
}));

import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { auditService } from '@/features/audit/audit.service';
import { copilotMemoryService } from '@/features/copilot/memory/copilot-memory.service';

describe('Phase 90 — clearMemoriesByScope', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.copilotMemory.deleteMany as jest.Mock).mockResolvedValue({ count: 3 });
  });

  it('scope=ALL deletes every memory for the user, scoped only by userId', async () => {
    const result = await copilotMemoryService.clearMemoriesByScope('user-a', 'ALL');

    expect(prisma.copilotMemory.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-a' } });
    expect(result.deletedCount).toBe(3);
    expect(redis.delByPattern).toHaveBeenCalled();
    expect(auditService.logEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'MEMORY_CLEARED' }));
  });

  it('scope=CONVERSATION deletes only CONVERSATION_MEMORY rows', async () => {
    await copilotMemoryService.clearMemoriesByScope('user-a', 'CONVERSATION');

    expect(prisma.copilotMemory.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-a', category: 'CONVERSATION_MEMORY' }
    });
  });

  it('scope=PROJECT without a projectId throws a ValidationError and never deletes', async () => {
    await expect(copilotMemoryService.clearMemoriesByScope('user-a', 'PROJECT')).rejects.toThrow(/projectId is required/i);
    expect(prisma.copilotMemory.deleteMany).not.toHaveBeenCalled();
  });

  it('invalidates the cache after clearing', async () => {
    await copilotMemoryService.clearMemoriesByScope('user-a', 'ALL');
    expect(redis.delByPattern).toHaveBeenCalledWith(expect.stringContaining('user:user-a'));
  });
});
