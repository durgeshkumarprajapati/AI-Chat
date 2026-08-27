jest.mock('@/lib/prisma', () => ({
  prisma: {
    ragConversation: { findUnique: jest.fn() },
    ragConversationMember: { findUnique: jest.fn() },
    projectDocument: { findMany: jest.fn() },
    projectKnowledgeBase: { findMany: jest.fn() },
    knowledgeBaseDocument: { findMany: jest.fn() }
  }
}));
jest.mock('@/features/projects/project.service', () => ({
  projectService: { getUserProjectRole: jest.fn() }
}));

import { prisma } from '@/lib/prisma';
import { projectService } from '@/features/projects/project.service';
import { scopeResolverService } from '@/features/rag/collaboration/scope-resolver.service';

function mockConversation(overrides: Partial<{ projectId: string | null }> = {}) {
  (prisma.ragConversation.findUnique as jest.Mock).mockResolvedValue({
    id: 'conv-p',
    type: 'PROJECT',
    projectId: 'project-1',
    knowledgeBaseId: null,
    createdById: 'user-1',
    ...overrides
  });
}

describe('ScopeResolverService — Phase 71C PROJECT resolution (foundation-level)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('denies a non-member before any ProjectDocument/ProjectKnowledgeBase query runs', async () => {
    mockConversation();
    (projectService.getUserProjectRole as jest.Mock).mockResolvedValue(undefined);

    await expect(scopeResolverService.resolveScope('user-2', 'conv-p')).rejects.toThrow();
    expect(prisma.projectDocument.findMany).not.toHaveBeenCalled();
    expect(prisma.projectKnowledgeBase.findMany).not.toHaveBeenCalled();
  });

  it('resolves a hard-scoped union of direct and KB-indirect documents for a VIEWER', async () => {
    mockConversation();
    (projectService.getUserProjectRole as jest.Mock).mockResolvedValue('VIEWER');
    (prisma.projectDocument.findMany as jest.Mock).mockResolvedValue([{ documentId: 'doc-1' }]);
    (prisma.projectKnowledgeBase.findMany as jest.Mock).mockResolvedValue([{ knowledgeBaseId: 'kb-1' }]);
    (prisma.knowledgeBaseDocument.findMany as jest.Mock).mockResolvedValue([{ documentId: 'doc-2' }]);

    const scope = await scopeResolverService.resolveScope('user-2', 'conv-p');

    expect(scope.isHardScoped).toBe(true);
    expect(scope.authorizedDocumentIds).toEqual(expect.arrayContaining(['doc-1', 'doc-2']));
    expect(scope.authorizedKnowledgeBaseIds).toEqual(['kb-1']);
  });

  it('rejects a conversation with no projectId', async () => {
    mockConversation({ projectId: null });

    await expect(scopeResolverService.resolveScope('user-1', 'conv-p')).rejects.toThrow();
  });

  it('a Project-A member resolving a Project-B conversation is denied by getUserProjectRole returning undefined', async () => {
    mockConversation({ projectId: 'project-B' });
    (projectService.getUserProjectRole as jest.Mock).mockResolvedValue(undefined);

    await expect(scopeResolverService.resolveScope('project-a-member', 'conv-p')).rejects.toThrow();
    expect(projectService.getUserProjectRole).toHaveBeenCalledWith('project-B', 'project-a-member');
  });
});
