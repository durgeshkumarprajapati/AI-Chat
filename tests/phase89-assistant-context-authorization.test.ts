jest.mock('@/lib/prisma', () => ({
  prisma: {
    document: { findFirst: jest.fn() },
    knowledgeBase: { findFirst: jest.fn() },
    meeting: { findFirst: jest.fn() },
    knowledgeEntity: { findUnique: jest.fn() },
    automation: { findFirst: jest.fn() }
  }
}));
jest.mock('@/features/projects/project-authorization.service', () => ({
  projectAuthorizationService: { authorizeProjectAccess: jest.fn() }
}));
jest.mock('@/features/knowledge-graph/knowledge-graph.rbac', () => ({
  knowledgeGraphRBAC: { canViewGraph: jest.fn() }
}));

import { prisma } from '@/lib/prisma';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { knowledgeGraphRBAC } from '@/features/knowledge-graph/knowledge-graph.rbac';
import { assistantContextAuthorizationService } from '@/features/assistant/context/assistant-context-authorization.service';
import { AuthorizationError } from '@/errors';

describe('Phase 89 — Assistant context re-authorization (never trust a client-supplied hint)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('silently DROPS an unauthorized contextHint.projectId — never throws, never leaks existence via a 403', async () => {
    (projectAuthorizationService.authorizeProjectAccess as jest.Mock).mockRejectedValue(new AuthorizationError('Access denied.'));

    const result = await assistantContextAuthorizationService.authorize('attacker-user', 'USER' as any, { projectId: 'project-not-mine' });

    expect(result.projectId).toBeUndefined();
  });

  it('keeps an authorized contextHint.projectId', async () => {
    (projectAuthorizationService.authorizeProjectAccess as jest.Mock).mockResolvedValue('EDITOR');

    const result = await assistantContextAuthorizationService.authorize('user-1', 'USER' as any, { projectId: 'project-mine' });

    expect(result.projectId).toBe('project-mine');
  });

  it('silently DROPS a contextHint.documentId not owned by the caller', async () => {
    (prisma.document.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await assistantContextAuthorizationService.authorize('attacker-user', 'USER' as any, { documentId: 'doc-not-mine' });

    expect(result.documentId).toBeUndefined();
    expect(prisma.document.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'doc-not-mine', userId: 'attacker-user' }) })
    );
  });

  it('keeps an owned contextHint.documentId', async () => {
    (prisma.document.findFirst as jest.Mock).mockResolvedValue({ id: 'doc-mine' });

    const result = await assistantContextAuthorizationService.authorize('user-1', 'USER' as any, { documentId: 'doc-mine' });

    expect(result.documentId).toBe('doc-mine');
  });

  it('silently DROPS a contextHint.knowledgeEntityId whose project the caller cannot view', async () => {
    (prisma.knowledgeEntity.findUnique as jest.Mock).mockResolvedValue({
      id: 'entity-1',
      userId: 'someone-else',
      projectId: 'project-1',
      status: 'ACTIVE'
    });
    (knowledgeGraphRBAC.canViewGraph as jest.Mock).mockResolvedValue(false);

    const result = await assistantContextAuthorizationService.authorize('attacker-user', 'USER' as any, { knowledgeEntityId: 'entity-1' });

    expect(result.knowledgeEntityId).toBeUndefined();
  });

  it('never fails the whole authorize() call just because ONE hint is invalid — other authorized hints still survive', async () => {
    (projectAuthorizationService.authorizeProjectAccess as jest.Mock).mockRejectedValue(new AuthorizationError('Access denied.'));
    (prisma.document.findFirst as jest.Mock).mockResolvedValue({ id: 'doc-mine' });

    const result = await assistantContextAuthorizationService.authorize('user-1', 'USER' as any, {
      projectId: 'project-not-mine',
      documentId: 'doc-mine'
    });

    expect(result.projectId).toBeUndefined();
    expect(result.documentId).toBe('doc-mine');
  });
});
