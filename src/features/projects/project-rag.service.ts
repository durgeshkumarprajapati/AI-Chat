import { prisma } from '@/lib/prisma';
import { env } from '@/config/env';
import { NotFoundError, AuthorizationError, ValidationError } from '@/errors';
import { MessageRole } from '@prisma/client';
import { projectAuthorizationService } from './project-authorization.service';
import { ragCollaborationOrchestratorService } from '@/features/rag/collaboration/rag-collaboration-orchestrator.service';
import { projectRagCacheService } from './project-rag.cache';
import { auditService } from '@/features/audit/audit.service';
import { collabPubSubService } from '@/features/collaboration/pubsub.service';

export interface ProjectConversationDetailsDTO {
  id: string;
  type: 'PROJECT';
  projectId: string;
  title: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

export interface ProjectMessageDTO {
  id: string;
  conversationId: string;
  authorId: string | null;
  role: MessageRole;
  content: string;
  citations: unknown;
  createdAt: Date;
  author?: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl?: string | null;
  } | null;
}

export class ProjectRagService {
  private ensureProjectRagEnabled(): void {
    if (env.server?.PROJECT_RAG_ENABLED === false) {
      throw new AuthorizationError('Project RAG Workspace is disabled');
    }
  }

  // --- CONVERSATION MANAGEMENT ---

  public async createProjectConversation(
    userId: string,
    projectId: string,
    title: string
  ): Promise<ProjectConversationDetailsDTO> {
    this.ensureProjectRagEnabled();
    await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'CREATE_CONVERSATION');

    if (!title || !title.trim()) {
      throw new ValidationError('Conversation title is required');
    }
    if (title.trim().length > 100) {
      throw new ValidationError('Conversation title cannot exceed 100 characters');
    }

    const conversation = await prisma.ragConversation.create({
      data: {
        type: 'PROJECT',
        projectId,
        createdById: userId,
        title: title.trim(),
        members: {
          create: { userId, role: 'OWNER' }
        }
      }
    });

    await auditService.logEvent({
      actorId: userId,
      action: 'PROJECT_CONVERSATION_CREATED',
      targetType: 'RAG_CONVERSATION',
      targetId: conversation.id,
      projectId,
      details: { title: conversation.title }
    });

    this.publishRealtimeEvent(projectId, 'project:updated', {
      projectId,
      conversationId: conversation.id,
      action: 'conversation_created'
    });

    return {
      id: conversation.id,
      type: 'PROJECT',
      projectId: conversation.projectId!,
      title: conversation.title,
      createdById: conversation.createdById,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messageCount: 0
    };
  }

  public async listProjectConversations(
    userId: string,
    projectId: string
  ): Promise<ProjectConversationDetailsDTO[]> {
    this.ensureProjectRagEnabled();
    await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'VIEW_PROJECT');

    const conversations = await prisma.ragConversation.findMany({
      where: { type: 'PROJECT', projectId },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { messages: true } }
      }
    });

    return conversations.map((c) => ({
      id: c.id,
      type: 'PROJECT',
      projectId: c.projectId!,
      title: c.title,
      createdById: c.createdById,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: c._count.messages
    }));
  }

  public async updateProjectConversation(
    userId: string,
    projectId: string,
    conversationId: string,
    title: string
  ): Promise<ProjectConversationDetailsDTO> {
    this.ensureProjectRagEnabled();
    await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'CREATE_CONVERSATION');

    if (!title || !title.trim()) {
      throw new ValidationError('Title cannot be empty');
    }

    const conversation = await prisma.ragConversation.findUnique({
      where: { id: conversationId }
    });
    if (!conversation || conversation.projectId !== projectId) {
      throw new NotFoundError('Project conversation');
    }

    const updated = await prisma.ragConversation.update({
      where: { id: conversationId },
      data: { title: title.trim() },
      include: { _count: { select: { messages: true } } }
    });

    await auditService.logEvent({
      actorId: userId,
      action: 'PROJECT_CONVERSATION_UPDATED',
      targetType: 'RAG_CONVERSATION',
      targetId: conversationId,
      projectId,
      details: { newTitle: updated.title }
    });

    return {
      id: updated.id,
      type: 'PROJECT',
      projectId: updated.projectId!,
      title: updated.title,
      createdById: updated.createdById,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      messageCount: updated._count.messages
    };
  }

  public async deleteProjectConversation(
    userId: string,
    projectId: string,
    conversationId: string
  ): Promise<void> {
    this.ensureProjectRagEnabled();
    await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'DELETE_CONVERSATION');

    const conversation = await prisma.ragConversation.findUnique({
      where: { id: conversationId }
    });
    if (!conversation || conversation.projectId !== projectId) {
      throw new NotFoundError('Project conversation');
    }

    await prisma.ragConversation.delete({ where: { id: conversationId } });

    await auditService.logEvent({
      actorId: userId,
      action: 'PROJECT_CONVERSATION_DELETED',
      targetType: 'RAG_CONVERSATION',
      targetId: conversationId,
      projectId
    });

    this.publishRealtimeEvent(projectId, 'project:updated', {
      projectId,
      conversationId,
      action: 'conversation_deleted'
    });
  }

  // --- SOURCE MANAGEMENT ---

  public async attachDocumentSource(
    userId: string,
    projectId: string,
    documentId: string
  ): Promise<void> {
    this.ensureProjectRagEnabled();
    await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'ATTACH_SOURCES');

    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, userId: true, filename: true }
    });
    if (!doc) {
      throw new NotFoundError('Document');
    }

    // Verify ownership or project member authorization
    if (doc.userId !== userId) {
      const isProjectMemberDoc = await prisma.projectDocument.findFirst({
        where: { documentId, project: { members: { some: { userId } } } }
      });
      if (!isProjectMemberDoc) {
        throw new AuthorizationError('Cannot attach document you do not own or have access to');
      }
    }

    const existing = await prisma.projectDocument.findUnique({
      where: { projectId_documentId: { projectId, documentId } }
    });
    if (existing) {
      throw new ValidationError('Document is already attached to this project');
    }

    await prisma.projectDocument.create({
      data: { projectId, documentId }
    });

    await projectRagCacheService.invalidateProjectCache(projectId);

    await auditService.logEvent({
      actorId: userId,
      action: 'PROJECT_SOURCE_ATTACHED',
      targetType: 'DOCUMENT',
      targetId: documentId,
      projectId,
      details: { filename: doc.filename }
    });

    this.publishRealtimeEvent(projectId, 'project:source_updated', {
      projectId,
      sourceType: 'DOCUMENT',
      sourceId: documentId,
      action: 'attached'
    });
  }

  public async detachDocumentSource(
    userId: string,
    projectId: string,
    documentId: string
  ): Promise<void> {
    this.ensureProjectRagEnabled();
    await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'REMOVE_SOURCES');

    const existing = await prisma.projectDocument.findUnique({
      where: { projectId_documentId: { projectId, documentId } }
    });
    if (!existing) {
      throw new NotFoundError('Attached project document');
    }

    await prisma.projectDocument.delete({
      where: { projectId_documentId: { projectId, documentId } }
    });

    await projectRagCacheService.invalidateProjectCache(projectId);

    await auditService.logEvent({
      actorId: userId,
      action: 'PROJECT_SOURCE_REMOVED',
      targetType: 'DOCUMENT',
      targetId: documentId,
      projectId
    });

    this.publishRealtimeEvent(projectId, 'project:source_updated', {
      projectId,
      sourceType: 'DOCUMENT',
      sourceId: documentId,
      action: 'detached'
    });
  }

  public async attachKnowledgeBaseSource(
    userId: string,
    projectId: string,
    knowledgeBaseId: string
  ): Promise<void> {
    this.ensureProjectRagEnabled();
    await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'ATTACH_SOURCES');

    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      select: { id: true, userId: true, name: true }
    });
    if (!kb) {
      throw new NotFoundError('Knowledge Base');
    }

    if (kb.userId !== userId) {
      throw new AuthorizationError('Cannot attach Knowledge Base you do not own');
    }

    const existing = await prisma.projectKnowledgeBase.findUnique({
      where: { projectId_knowledgeBaseId: { projectId, knowledgeBaseId } }
    });
    if (existing) {
      throw new ValidationError('Knowledge Base is already attached to this project');
    }

    await prisma.projectKnowledgeBase.create({
      data: { projectId, knowledgeBaseId }
    });

    await projectRagCacheService.invalidateProjectCache(projectId);

    await auditService.logEvent({
      actorId: userId,
      action: 'PROJECT_SOURCE_ATTACHED',
      targetType: 'KNOWLEDGE_BASE',
      targetId: knowledgeBaseId,
      projectId,
      details: { name: kb.name }
    });

    this.publishRealtimeEvent(projectId, 'project:source_updated', {
      projectId,
      sourceType: 'KNOWLEDGE_BASE',
      sourceId: knowledgeBaseId,
      action: 'attached'
    });
  }

  public async detachKnowledgeBaseSource(
    userId: string,
    projectId: string,
    knowledgeBaseId: string
  ): Promise<void> {
    this.ensureProjectRagEnabled();
    await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'REMOVE_SOURCES');

    const existing = await prisma.projectKnowledgeBase.findUnique({
      where: { projectId_knowledgeBaseId: { projectId, knowledgeBaseId } }
    });
    if (!existing) {
      throw new NotFoundError('Attached project Knowledge Base');
    }

    await prisma.projectKnowledgeBase.delete({
      where: { projectId_knowledgeBaseId: { projectId, knowledgeBaseId } }
    });

    await projectRagCacheService.invalidateProjectCache(projectId);

    await auditService.logEvent({
      actorId: userId,
      action: 'PROJECT_SOURCE_REMOVED',
      targetType: 'KNOWLEDGE_BASE',
      targetId: knowledgeBaseId,
      projectId
    });

    this.publishRealtimeEvent(projectId, 'project:source_updated', {
      projectId,
      sourceType: 'KNOWLEDGE_BASE',
      sourceId: knowledgeBaseId,
      action: 'detached'
    });
  }

  // --- MESSAGING & AI QUESTIONS ---

  public async getMessages(
    userId: string,
    projectId: string,
    conversationId: string
  ): Promise<ProjectMessageDTO[]> {
    this.ensureProjectRagEnabled();
    await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'VIEW_PROJECT');

    const messages = await prisma.ragMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, name: true, email: true, avatarUrl: true } }
      }
    });

    return messages.map((m) => ({
      id: m.id,
      conversationId: m.conversationId,
      authorId: m.authorId,
      role: m.role,
      content: m.content,
      citations: m.citations,
      createdAt: m.createdAt,
      author: m.author
        ? {
            id: m.author.id,
            name: m.author.name,
            email: m.author.email,
            avatarUrl: m.author.avatarUrl
          }
        : null
    }));
  }

  public async sendMessage(
    userId: string,
    projectId: string,
    conversationId: string,
    content: string
  ): Promise<ProjectMessageDTO> {
    this.ensureProjectRagEnabled();
    await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'POST_MESSAGE');

    if (!content || !content.trim()) {
      throw new ValidationError('Message content cannot be empty');
    }

    const message = await prisma.ragMessage.create({
      data: {
        conversationId,
        authorId: userId,
        role: 'USER',
        content: content.trim()
      },
      include: {
        author: { select: { id: true, name: true, email: true, avatarUrl: true } }
      }
    });

    await prisma.ragConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() }
    });

    await auditService.logEvent({
      actorId: userId,
      action: 'PROJECT_MESSAGE_SENT',
      targetType: 'RAG_MESSAGE',
      targetId: message.id,
      projectId,
      details: { conversationId }
    });

    this.publishRealtimeEvent(projectId, 'project:message_created', {
      projectId,
      conversationId,
      messageId: message.id,
      role: 'USER'
    });

    return {
      id: message.id,
      conversationId: message.conversationId,
      authorId: message.authorId,
      role: message.role,
      content: message.content,
      citations: message.citations,
      createdAt: message.createdAt,
      author: message.author
        ? {
            id: message.author.id,
            name: message.author.name,
            email: message.author.email,
            avatarUrl: message.author.avatarUrl
          }
        : null
    };
  }

  public async askAI(
    userId: string,
    projectId: string,
    conversationId: string,
    question: string,
    opts?: { model?: string }
  ): Promise<{ userMessage: ProjectMessageDTO; assistantMessage: ProjectMessageDTO }> {
    this.ensureProjectRagEnabled();
    await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'ASK_AI');

    if (!question || !question.trim()) {
      throw new ValidationError('Question cannot be empty');
    }

    const userMessage = await prisma.ragMessage.create({
      data: {
        conversationId,
        authorId: userId,
        role: 'USER',
        content: question.trim()
      },
      include: {
        author: { select: { id: true, name: true, email: true, avatarUrl: true } }
      }
    });

    await auditService.logEvent({
      actorId: userId,
      action: 'PROJECT_AI_QUERY',
      targetType: 'RAG_CONVERSATION',
      targetId: conversationId,
      projectId,
      details: { queryLength: question.trim().length }
    });

    this.publishRealtimeEvent(projectId, 'project:ai_response_started', {
      projectId,
      conversationId
    });

    const orchestratedAnswer = await ragCollaborationOrchestratorService.orchestrateForConversation(
      userId,
      conversationId,
      question.trim(),
      opts
    );

    const assistantMessage = await prisma.ragMessage.create({
      data: {
        conversationId,
        authorId: null,
        role: 'ASSISTANT',
        content: orchestratedAnswer.answer,
        citations: JSON.parse(JSON.stringify(orchestratedAnswer.citations ?? []))
      }
    });

    await prisma.ragConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() }
    });

    await auditService.logEvent({
      actorId: userId,
      action: 'PROJECT_AI_RESPONSE',
      targetType: 'RAG_MESSAGE',
      targetId: assistantMessage.id,
      projectId,
      details: { citationsCount: (orchestratedAnswer.citations ?? []).length }
    });

    this.publishRealtimeEvent(projectId, 'project:ai_response_completed', {
      projectId,
      conversationId,
      messageId: assistantMessage.id
    });

    return {
      userMessage: {
        id: userMessage.id,
        conversationId: userMessage.conversationId,
        authorId: userMessage.authorId,
        role: userMessage.role,
        content: userMessage.content,
        citations: userMessage.citations,
        createdAt: userMessage.createdAt,
        author: userMessage.author
          ? {
              id: userMessage.author.id,
              name: userMessage.author.name,
              email: userMessage.author.email,
              avatarUrl: userMessage.author.avatarUrl
            }
          : null
      },
      assistantMessage: {
        id: assistantMessage.id,
        conversationId: assistantMessage.conversationId,
        authorId: null,
        role: assistantMessage.role,
        content: assistantMessage.content,
        citations: assistantMessage.citations,
        createdAt: assistantMessage.createdAt,
        author: null
      }
    };
  }

  // --- HELPERS ---

  private publishRealtimeEvent(channelId: string, type: any, data: unknown): void {
    if (env.server?.PROJECT_RAG_REALTIME_ENABLED === false) return;
    try {
      collabPubSubService.publish(channelId, {
        type,
        channelId,
        data,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.warn('[ProjectRagService] Realtime broadcast error:', err);
    }
  }
}

export const projectRagService = new ProjectRagService();
