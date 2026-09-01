jest.mock('@/lib/prisma', () => ({
  prisma: {
    copilotMemory: { findMany: jest.fn(), deleteMany: jest.fn() },
    memorySettings: { findUnique: jest.fn() }
  }
}));
jest.mock('@/lib/redis', () => ({
  redis: { getJson: jest.fn().mockRejectedValue(new Error('no redis')), setJson: jest.fn(), del: jest.fn(), delByPattern: jest.fn() }
}));
jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn().mockResolvedValue(true), getNumber: jest.fn((_k: string, d: number) => Promise.resolve(d)) }
}));
jest.mock('@/features/audit/audit.service', () => ({
  auditService: { logEvent: jest.fn().mockResolvedValue(undefined) }
}));
jest.mock('@/features/projects/project-authorization.service', () => ({
  projectAuthorizationService: { authorizeProjectAccess: jest.fn() }
}));

import { prisma } from '@/lib/prisma';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { copilotMemoryService } from '@/features/copilot/memory/copilot-memory.service';
import { AuthorizationError } from '@/errors';

describe('Phase 90 — Project-scoped memory requires real project authorization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.memorySettings.findUnique as jest.Mock).mockResolvedValue(null);
  });

  it('clearMemoriesByScope(PROJECT) throws when the user is not actually authorized on that project, and never deletes', async () => {
    (projectAuthorizationService.authorizeProjectAccess as jest.Mock).mockRejectedValue(
      new AuthorizationError('Access denied.')
    );

    await expect(copilotMemoryService.clearMemoriesByScope('user-a', 'PROJECT', 'project-x')).rejects.toThrow(
      AuthorizationError
    );
    expect(prisma.copilotMemory.deleteMany).not.toHaveBeenCalled();
  });

  it('clearMemoriesByScope(PROJECT) re-validates authorization via projectAuthorizationService (never trusts the client-supplied projectId alone)', async () => {
    (projectAuthorizationService.authorizeProjectAccess as jest.Mock).mockResolvedValue('EDITOR');
    (prisma.copilotMemory.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });

    await copilotMemoryService.clearMemoriesByScope('user-a', 'PROJECT', 'project-x');

    expect(projectAuthorizationService.authorizeProjectAccess).toHaveBeenCalledWith('user-a', 'project-x', 'VIEW_PROJECT');
    expect(prisma.copilotMemory.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-a', projectId: 'project-x' } });
  });

  it('retrieveRankedMemories only includes a project scope filter when a projectId is actually supplied — never expands scope on its own', async () => {
    (prisma.copilotMemory.findMany as jest.Mock).mockResolvedValue([]);

    await copilotMemoryService.retrieveRankedMemories('user-a', {});

    const callArgs = (prisma.copilotMemory.findMany as jest.Mock).mock.calls[0][0];
    // With no projectId supplied, the only scope filter is the global (projectId: null) one.
    expect(callArgs.where.OR).toEqual([{ projectId: null }]);
  });
});
