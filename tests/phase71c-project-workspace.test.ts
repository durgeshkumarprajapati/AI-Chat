import { ScopeResolverService } from '@/features/rag/collaboration/scope-resolver.service';
import { ProjectRagService } from '@/features/projects/project-rag.service';
import { projectRagCacheService } from '@/features/projects/project-rag.cache';
import { collabPubSubService } from '@/features/collaboration/pubsub.service';
import { prisma } from '@/lib/prisma';
import { AuthorizationError } from '@/errors';

// Mock dependencies for unit test execution
jest.mock('@/lib/prisma', () => ({
  prisma: {
    project: {
      findUnique: jest.fn(),
      findMany: jest.fn()
    },
    projectMember: {
      findUnique: jest.fn(),
      findMany: jest.fn()
    },
    projectDocument: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn()
    },
    projectKnowledgeBase: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn()
    },
    knowledgeBaseDocument: {
      findMany: jest.fn()
    },
    document: {
      findUnique: jest.fn()
    },
    knowledgeBase: {
      findUnique: jest.fn()
    },
    ragConversation: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    },
    ragMessage: {
      findMany: jest.fn(),
      create: jest.fn()
    },
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn()
    }
  }
}));

jest.mock('@/features/collaboration/pubsub.service', () => ({
  collabPubSubService: {
    publish: jest.fn()
  }
}));

jest.mock('@/features/projects/project-rag.cache', () => ({
  projectRagCacheService: {
    generateCacheKey: jest.fn().mockReturnValue('rag:project:tenant:t1:project:p1:conversation:c1:sources:s1:query:q1'),
    getCachedAnswer: jest.fn().mockResolvedValue(null),
    setCachedAnswer: jest.fn().mockResolvedValue(undefined),
    invalidateProjectCache: jest.fn().mockResolvedValue(undefined)
  }
}));

jest.mock('@/features/rag/collaboration/rag-collaboration-orchestrator.service', () => ({
  ragCollaborationOrchestratorService: {
    orchestrateForConversation: jest.fn().mockResolvedValue({
      conversationId: 'proj-conv-1',
      answerMode: 'DOCUMENT_GROUNDED',
      answer: 'Grounded Project AI Response',
      citations: [
        {
          documentId: 'p-doc-1',
          chunkId: 'c-1',
          filename: 'ProjectSpec.pdf',
          pageNumber: 2,
          similarity: 0.95
        }
      ]
    })
  }
}));

describe('Phase 71C — Production Project RAG Workspace', () => {
  let scopeResolver: ScopeResolverService;
  let projectRagService: ProjectRagService;

  beforeEach(() => {
    jest.clearAllMocks();
    scopeResolver = new ScopeResolverService();
    projectRagService = new ProjectRagService();
  });

  describe('1. ScopeResolverService — PROJECT Scope Resolution', () => {
    it('resolves project scope with attached project documents and KB documents', async () => {
      (prisma.ragConversation.findUnique as jest.Mock).mockResolvedValue({
        id: 'conv-proj-1',
        type: 'PROJECT',
        projectId: 'project-100',
        knowledgeBaseId: null,
        createdById: 'owner-1'
      });

      (prisma.project.findUnique as jest.Mock).mockResolvedValue({
        id: 'project-100',
        ownerId: 'owner-1'
      });

      (prisma.projectDocument.findMany as jest.Mock).mockResolvedValue([
        { documentId: 'p-doc-1' }
      ]);

      (prisma.projectKnowledgeBase.findMany as jest.Mock).mockResolvedValue([
        { knowledgeBaseId: 'p-kb-1' }
      ]);

      (prisma.knowledgeBaseDocument.findMany as jest.Mock).mockResolvedValue([
        { documentId: 'kb-doc-1' },
        { documentId: 'kb-doc-2' }
      ]);

      const scope = await scopeResolver.resolveScope('owner-1', 'conv-proj-1');

      expect(scope).toEqual({
        userId: 'owner-1',
        conversationId: 'conv-proj-1',
        conversationType: 'PROJECT',
        projectId: 'project-100',
        authorizedDocumentIds: ['p-doc-1', 'kb-doc-1', 'kb-doc-2'],
        authorizedKnowledgeBaseIds: ['p-kb-1'],
        allowWebSearch: true,
        allowKnowledgeGraph: false,
        isHardScoped: true
      });
    });

    it('fails closed with AuthorizationError if user is not a project member or owner', async () => {
      (prisma.ragConversation.findUnique as jest.Mock).mockResolvedValue({
        id: 'conv-proj-1',
        type: 'PROJECT',
        projectId: 'project-100',
        knowledgeBaseId: null,
        createdById: 'owner-1'
      });

      (prisma.project.findUnique as jest.Mock).mockResolvedValue({
        id: 'project-100',
        ownerId: 'owner-1'
      });

      (prisma.projectMember.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(scopeResolver.resolveScope('non-member-user', 'conv-proj-1')).rejects.toThrow(
        AuthorizationError
      );
    });
  });

  describe('2. Project Source Attachment Authorization & Cache Invalidation', () => {
    it('attaches document source when authorized and invalidates project RAG cache', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({
        id: 'project-1',
        ownerId: 'owner-1'
      });

      (prisma.document.findUnique as jest.Mock).mockResolvedValue({
        id: 'doc-1',
        userId: 'owner-1',
        filename: 'Spec.pdf'
      });

      (prisma.projectDocument.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.projectDocument.create as jest.Mock).mockResolvedValue({
        id: 'pd-1',
        projectId: 'project-1',
        documentId: 'doc-1'
      });

      await projectRagService.attachDocumentSource('owner-1', 'project-1', 'doc-1');

      expect(projectRagCacheService.invalidateProjectCache).toHaveBeenCalledWith('project-1');
      expect(collabPubSubService.publish).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({ type: 'project:source_updated' })
      );
    });

    it('rejects document attachment if user does not own or have authorization for the document', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({
        id: 'project-1',
        ownerId: 'owner-1'
      });

      (prisma.document.findUnique as jest.Mock).mockResolvedValue({
        id: 'unauthorized-doc',
        userId: 'stranger-user',
        filename: 'Secret.pdf'
      });

      (prisma.projectDocument.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        projectRagService.attachDocumentSource('owner-1', 'project-1', 'unauthorized-doc')
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('3. Project RAG Messaging & AI Question Answering', () => {
    it('sends user message and publishes real-time project event', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({
        id: 'project-1',
        ownerId: 'owner-1'
      });

      (prisma.ragMessage.create as jest.Mock).mockResolvedValue({
        id: 'msg-1',
        conversationId: 'conv-1',
        authorId: 'owner-1',
        role: 'USER',
        content: 'Project question',
        citations: [],
        createdAt: new Date(),
        author: { id: 'owner-1', name: 'Owner', email: 'owner@test.com' }
      });

      (prisma.ragConversation.update as jest.Mock).mockResolvedValue({});

      const msg = await projectRagService.sendMessage('owner-1', 'project-1', 'conv-1', 'Project question');

      expect(msg.id).toBe('msg-1');
      expect(msg.content).toBe('Project question');
      expect(collabPubSubService.publish).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({ type: 'project:message_created' })
      );
    });

    it('asks AI in project scope and logs enterprise audit event', async () => {
      (prisma.project.findUnique as jest.Mock).mockResolvedValue({
        id: 'project-1',
        ownerId: 'owner-1'
      });

      (prisma.ragMessage.create as jest.Mock)
        .mockResolvedValueOnce({
          id: 'user-msg-1',
          conversationId: 'conv-1',
          authorId: 'owner-1',
          role: 'USER',
          content: 'What is the architecture spec?',
          citations: [],
          createdAt: new Date(),
          author: { id: 'owner-1', name: 'Owner', email: 'owner@test.com' }
        })
        .mockResolvedValueOnce({
          id: 'ai-msg-1',
          conversationId: 'conv-1',
          authorId: null,
          role: 'ASSISTANT',
          content: 'Grounded Project AI Response',
          citations: [{ documentId: 'p-doc-1', filename: 'ProjectSpec.pdf' }],
          createdAt: new Date()
        });

      (prisma.ragConversation.update as jest.Mock).mockResolvedValue({});

      const result = await projectRagService.askAI('owner-1', 'project-1', 'conv-1', 'What is the architecture spec?');

      expect(result.assistantMessage.content).toBe('Grounded Project AI Response');
      expect(collabPubSubService.publish).toHaveBeenCalledWith(
        'project-1',
        expect.objectContaining({ type: 'project:ai_response_completed' })
      );
    });
  });
});
