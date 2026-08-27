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
import { scopeResolverService } from '@/features/rag/collaboration/scope-resolver.service';

describe('ScopeResolverService — Phase 71A PRIVATE resolution', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves an unrestricted scope for a member of a PRIVATE conversation', async () => {
    (prisma.ragConversation.findUnique as jest.Mock).mockResolvedValue({
      id: 'conv-1',
      type: 'PRIVATE',
      projectId: null,
      knowledgeBaseId: null,
      createdById: 'user-1'
    });
    (prisma.ragConversationMember.findUnique as jest.Mock).mockResolvedValue({ conversationId: 'conv-1', userId: 'user-1' });

    const scope = await scopeResolverService.resolveScope('user-1', 'conv-1');

    expect(scope).toEqual({
      userId: 'user-1',
      conversationId: 'conv-1',
      conversationType: 'PRIVATE',
      authorizedDocumentIds: undefined,
      authorizedKnowledgeBaseIds: undefined,
      allowWebSearch: true,
      allowKnowledgeGraph: false,
      isHardScoped: false
    });
  });

  it('throws AuthorizationError for a non-member, without ever narrowing to documents', async () => {
    (prisma.ragConversation.findUnique as jest.Mock).mockResolvedValue({
      id: 'conv-1',
      type: 'PRIVATE',
      projectId: null,
      knowledgeBaseId: null,
      createdById: 'user-1'
    });
    (prisma.ragConversationMember.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(scopeResolverService.resolveScope('user-2', 'conv-1')).rejects.toThrow(/Access denied/);
  });

  it('throws NotFoundError for a nonexistent conversation', async () => {
    (prisma.ragConversation.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(scopeResolverService.resolveScope('user-1', 'missing-conv')).rejects.toThrow();
  });

  it('GROUP conversations fail closed (not yet implemented until Phase 71B)', async () => {
    (prisma.ragConversation.findUnique as jest.Mock).mockResolvedValue({
      id: 'conv-2',
      type: 'GROUP',
      projectId: null,
      knowledgeBaseId: null,
      createdById: 'user-1'
    });

    await expect(scopeResolverService.resolveScope('user-1', 'conv-2')).rejects.toThrow();
  });
});
