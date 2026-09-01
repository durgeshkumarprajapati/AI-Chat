jest.mock('@/lib/prisma', () => ({
  prisma: {
    copilotMemory: { findMany: jest.fn() }
  }
}));
jest.mock('@/features/audit/audit.service', () => ({
  auditService: { logEvent: jest.fn().mockResolvedValue(undefined) }
}));
jest.mock('@/features/projects/project-authorization.service', () => ({
  projectAuthorizationService: { authorizeProjectAccess: jest.fn() }
}));
jest.mock('@/features/config/config.service', () => ({
  configService: { getBoolean: jest.fn().mockResolvedValue(true), getNumber: jest.fn((_k: string, d: number) => Promise.resolve(d)) }
}));

import { prisma } from '@/lib/prisma';
import { auditService } from '@/features/audit/audit.service';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { copilotMemoryService } from '@/features/copilot/memory/copilot-memory.service';
import { AuthorizationError } from '@/errors';

function row(overrides: Partial<any>) {
  return {
    id: 'id',
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
    updatedAt: new Date(),
    ...overrides
  };
}

describe('Phase 90 — Memory export', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('only ever queries rows scoped to the requesting userId, never another user\'s data', async () => {
    (prisma.copilotMemory.findMany as jest.Mock).mockResolvedValue([]);

    await copilotMemoryService.exportUserMemories('user-a');

    expect(prisma.copilotMemory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-a' } })
    );
  });

  it('drops memories tied to a shared project the user is no longer authorized on, even though the DB row itself belongs to user-a', async () => {
    (prisma.copilotMemory.findMany as jest.Mock).mockResolvedValue([
      row({ id: 'own-global', projectId: null }),
      row({ id: 'own-shared-project', projectId: 'project-shared' })
    ]);
    (projectAuthorizationService.authorizeProjectAccess as jest.Mock).mockRejectedValue(new AuthorizationError('no longer a member'));

    const payload = await copilotMemoryService.exportUserMemories('user-a');

    expect(payload.memories.map((m) => m.id)).toEqual(['own-global']);
    expect(payload.memoryCount).toBe(1);
  });

  it('includes a project-scoped memory only when authorization is re-validated successfully', async () => {
    (prisma.copilotMemory.findMany as jest.Mock).mockResolvedValue([row({ id: 'authorized', projectId: 'project-ok' })]);
    (projectAuthorizationService.authorizeProjectAccess as jest.Mock).mockResolvedValue('VIEWER');

    const payload = await copilotMemoryService.exportUserMemories('user-a');

    expect(payload.memories.map((m) => m.id)).toEqual(['authorized']);
    expect(projectAuthorizationService.authorizeProjectAccess).toHaveBeenCalledWith('user-a', 'project-ok', 'VIEW_PROJECT');
  });

  it('audits both MEMORY_EXPORT_REQUESTED and MEMORY_EXPORT_COMPLETED', async () => {
    (prisma.copilotMemory.findMany as jest.Mock).mockResolvedValue([]);

    await copilotMemoryService.exportUserMemories('user-a');

    expect(auditService.logEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'MEMORY_EXPORT_REQUESTED' }));
    expect(auditService.logEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'MEMORY_EXPORT_COMPLETED' }));
  });
});
