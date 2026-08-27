import { ScopeResolverService } from '@/features/rag/collaboration/scope-resolver.service';
import { GroupRagService } from '@/features/rag/collaboration/group-rag.service';
import { groupRagCacheService } from '@/features/rag/collaboration/group-rag.cache';
import { collabPubSubService } from '@/features/collaboration/pubsub.service';
import { prisma } from '@/lib/prisma';
import { AuthorizationError } from '@/errors';

// Mock dependencies for unit test execution
jest.mock('@/lib/prisma', () => ({
  prisma: {
    ragConversation: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    ragConversationMember: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn()
    },
    ragConversationDocumentSource: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      count: jest.fn()
    },
    ragConversationKnowledgeBaseSource: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      count: jest.fn()
    },
    knowledgeBaseDocument: {
      findMany: jest.fn()
    },
    document: {
      findMany: jest.fn(),
      findUnique: jest.fn()
    },
    knowledgeBase: {
      findMany: jest.fn(),
      findUnique: jest.fn()
    },
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn()
    },
    ragMessage: {
      findMany: jest.fn(),
      create: jest.fn()
    }
  }
}));

jest.mock('@/features/collaboration/pubsub.service', () => ({
  collabPubSubService: {
    publish: jest.fn()
  }
}));

jest.mock('@/features/rag/collaboration/group-rag.cache', () => ({
  groupRagCacheService: {
    generateCacheKey: jest.fn().mockReturnValue('rag:group:tenant:t1:conversation:c1:sources:s1:query:q1'),
    getCachedAnswer: jest.fn().mockResolvedValue(null),
    setCachedAnswer: jest.fn().mockResolvedValue(undefined),
    invalidateGroupCache: jest.fn().mockResolvedValue(undefined)
  }
}));

jest.mock('@/features/rag/collaboration/rag-collaboration-orchestrator.service', () => ({
  ragCollaborationOrchestratorService: {
    orchestrateForConversation: jest.fn().mockResolvedValue({
      conversationId: 'group-1',
      answerMode: 'DOCUMENT_GROUNDED',
      answer: 'Grounded group AI response',
      citations: [
        {
          documentId: 'doc-1',
          chunkId: 'c-1',
          filename: 'Architecture.pdf',
          pageNumber: 1,
          similarity: 0.92
        }
      ]
    })
  }
}));

describe('Phase 71B — Production Group RAG Chat', () => {
  let scopeResolver: ScopeResolverService;
  let groupService: GroupRagService;

  beforeEach(() => {
    jest.clearAllMocks();
    scopeResolver = new ScopeResolverService();
    groupService = new GroupRagService();
  });

  describe('1. ScopeResolverService — GROUP Scope Resolution', () => {
    it('resolves group scope with attached document and KB source IDs for authorized member', async () => {
      (prisma.ragConversation.findUnique as jest.Mock).mockResolvedValue({
        id: 'group-1',
        type: 'GROUP',
        projectId: null,
        knowledgeBaseId: null,
        createdById: 'owner-1'
      });

      (prisma.ragConversationMember.findUnique as jest.Mock).mockResolvedValue({
        id: 'm-1',
        conversationId: 'group-1',
        userId: 'user-1',
        role: 'EDITOR'
      });

      (prisma.ragConversationDocumentSource.findMany as jest.Mock).mockResolvedValue([
        { documentId: 'doc-100' }
      ]);

      (prisma.ragConversationKnowledgeBaseSource.findMany as jest.Mock).mockResolvedValue([
        { knowledgeBaseId: 'kb-200' }
      ]);

      (prisma.knowledgeBaseDocument.findMany as jest.Mock).mockResolvedValue([
        { documentId: 'doc-201' },
        { documentId: 'doc-202' }
      ]);

      const scope = await scopeResolver.resolveScope('user-1', 'group-1');

      expect(scope).toEqual({
        userId: 'user-1',
        conversationId: 'group-1',
        conversationType: 'GROUP',
        authorizedDocumentIds: ['doc-100', 'doc-201', 'doc-202'],
        authorizedKnowledgeBaseIds: ['kb-200'],
        allowWebSearch: true,
        allowKnowledgeGraph: false,
        isHardScoped: true
      });
    });

    it('fails closed with AuthorizationError for non-members', async () => {
      (prisma.ragConversation.findUnique as jest.Mock).mockResolvedValue({
        id: 'group-1',
        type: 'GROUP',
        projectId: null,
        knowledgeBaseId: null,
        createdById: 'owner-1'
      });

      (prisma.ragConversationMember.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(scopeResolver.resolveScope('non-member', 'group-1')).rejects.toThrow(
        AuthorizationError
      );
    });
  });

  describe('2. Group RAG Conversation Creation & Management', () => {
    it('creates group conversation with OWNER role and attached sources', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'user-2' }]);
      (prisma.document.findMany as jest.Mock).mockResolvedValue([{ id: 'doc-1' }]);
      (prisma.knowledgeBase.findMany as jest.Mock).mockResolvedValue([{ id: 'kb-1' }]);

      (prisma.ragConversation.create as jest.Mock).mockResolvedValue({
        id: 'group-created-1',
        type: 'GROUP',
        createdById: 'owner-1',
        title: 'Team Group',
        summary: 'Description',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      (prisma.ragConversation.findUnique as jest.Mock).mockResolvedValue({
        id: 'group-created-1',
        type: 'GROUP',
        createdById: 'owner-1',
        title: 'Team Group',
        summary: 'Description',
        createdAt: new Date(),
        updatedAt: new Date(),
        members: [
          {
            id: 'm-1',
            conversationId: 'group-created-1',
            userId: 'owner-1',
            role: 'OWNER',
            joinedAt: new Date(),
            user: { id: 'owner-1', email: 'owner@test.com', fullName: 'Owner' }
          }
        ],
        documentSources: [],
        knowledgeBaseSources: [],
        _count: { messages: 0 }
      });

      const res = await groupService.createGroupConversation('owner-1', {
        title: 'Team Group',
        summary: 'Description',
        memberUserIds: ['user-2'],
        documentSourceIds: ['doc-1'],
        knowledgeBaseSourceIds: ['kb-1']
      });

      expect(res.id).toBe('group-created-1');
      expect(res.title).toBe('Team Group');
      expect(res.userRole).toBe('OWNER');
      expect(collabPubSubService.publish).toHaveBeenCalledWith(
        'group-created-1',
        expect.objectContaining({ type: 'rag:group_conversation_updated' })
      );
    });

    it('rejects source attachment if document does not belong to creator', async () => {
      (prisma.document.findMany as jest.Mock).mockResolvedValue([]); // Returns empty because doc doesn't belong to caller

      await expect(
        groupService.createGroupConversation('user-1', {
          title: 'Hacked Group',
          documentSourceIds: ['unauthorized-doc-id']
        })
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('3. Group Source Authorization & Cache Invalidation', () => {
    it('attaches document source only if authorized and invalidates cache', async () => {
      (prisma.ragConversationMember.findUnique as jest.Mock).mockResolvedValue({
        id: 'm-1',
        conversationId: 'group-1',
        userId: 'owner-1',
        role: 'OWNER'
      });

      (prisma.document.findUnique as jest.Mock).mockResolvedValue({
        id: 'doc-1',
        userId: 'owner-1',
        filename: 'report.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        createdAt: new Date()
      });

      (prisma.ragConversationDocumentSource.count as jest.Mock).mockResolvedValue(0);
      (prisma.ragConversationDocumentSource.findUnique as jest.Mock).mockResolvedValue(null);

      (prisma.ragConversationDocumentSource.create as jest.Mock).mockResolvedValue({
        id: 'src-1',
        conversationId: 'group-1',
        documentId: 'doc-1',
        addedByUserId: 'owner-1',
        createdAt: new Date(),
        document: { id: 'doc-1', filename: 'report.pdf', fileSize: 1024, mimeType: 'application/pdf', createdAt: new Date() },
        addedBy: { id: 'owner-1', fullName: 'Owner', email: 'owner@test.com' }
      });

      const src = await groupService.addDocumentSource('owner-1', 'group-1', 'doc-1');

      expect(src.id).toBe('src-1');
      expect(groupRagCacheService.invalidateGroupCache).toHaveBeenCalledWith('group-1');
      expect(collabPubSubService.publish).toHaveBeenCalledWith(
        'group-1',
        expect.objectContaining({ type: 'rag:group_source_added' })
      );
    });
  });

  describe('4. Message Posting & AI Question Answering', () => {
    it('prevents VIEWER role from sending messages or asking AI', async () => {
      (prisma.ragConversationMember.findUnique as jest.Mock).mockResolvedValue({
        id: 'm-1',
        conversationId: 'group-1',
        userId: 'viewer-1',
        role: 'VIEWER'
      });

      await expect(groupService.sendMessage('viewer-1', 'group-1', 'Hello')).rejects.toThrow(
        AuthorizationError
      );

      await expect(groupService.askAI('viewer-1', 'group-1', 'What is the project goal?')).rejects.toThrow(
        AuthorizationError
      );
    });

    it('executes askAI for EDITOR role and publishes real-time response', async () => {
      (prisma.ragConversationMember.findUnique as jest.Mock).mockResolvedValue({
        id: 'm-1',
        conversationId: 'group-1',
        userId: 'editor-1',
        role: 'EDITOR'
      });

      (prisma.ragMessage.create as jest.Mock)
        .mockResolvedValueOnce({
          id: 'msg-user-1',
          conversationId: 'group-1',
          authorId: 'editor-1',
          role: 'USER',
          content: 'What are the system components?',
          citations: [],
          createdAt: new Date(),
          author: { id: 'editor-1', fullName: 'Editor', email: 'editor@test.com' }
        })
        .mockResolvedValueOnce({
          id: 'msg-assistant-1',
          conversationId: 'group-1',
          authorId: null,
          role: 'ASSISTANT',
          content: 'Grounded group AI response',
          citations: [{ documentId: 'doc-1', filename: 'Architecture.pdf' }],
          createdAt: new Date()
        });

      (prisma.ragConversation.update as jest.Mock).mockResolvedValue({});

      const result = await groupService.askAI('editor-1', 'group-1', 'What are the system components?');

      expect(result.userMessage.content).toBe('What are the system components?');
      expect(result.assistantMessage.content).toBe('Grounded group AI response');
      expect(collabPubSubService.publish).toHaveBeenCalledWith(
        'group-1',
        expect.objectContaining({ type: 'rag:group_ai_response_created' })
      );
    });
  });
});
