import { prisma } from '@/lib/prisma';
import { env } from '@/config/env';
import { NotFoundError, AuthorizationError, ValidationError } from '@/errors';
import { ProjectMemberRole } from '@prisma/client';
import { ragCollaborationOrchestratorService } from './rag-collaboration-orchestrator.service';
import { groupRagCacheService } from './group-rag.cache';
import { collabPubSubService } from '@/features/collaboration/pubsub.service';
import {
  CreateGroupConversationDTO,
  UpdateGroupConversationDTO,
  GroupConversationDetailsDTO,
  GroupMemberDTO,
  GroupDocumentSourceDTO,
  GroupKBSourceDTO,
  GroupMessageDTO
} from './group-rag.types';

export class GroupRagService {
  private ensureGroupRagEnabled(): void {
    if (env.server?.GROUP_RAG_ENABLED === false) {
      throw new AuthorizationError('Group RAG Chat is disabled');
    }
  }

  public async createGroupConversation(
    userId: string,
    data: CreateGroupConversationDTO
  ): Promise<GroupConversationDetailsDTO> {
    this.ensureGroupRagEnabled();

    if (!data.title || !data.title.trim()) {
      throw new ValidationError('Group title is required');
    }
    if (data.title.trim().length > 100) {
      throw new ValidationError('Group title cannot exceed 100 characters');
    }

    const initialMemberIds = Array.from(new Set(data.memberUserIds ?? []));
    const maxMembers = env.server?.GROUP_RAG_MAX_MEMBERS ?? 50;
    if (initialMemberIds.length + 1 > maxMembers) {
      throw new ValidationError(`Member limit exceeded. Maximum members allowed: ${maxMembers}`);
    }

    if (initialMemberIds.length > 0) {
      const existingUsers = await prisma.user.findMany({
        where: { id: { in: initialMemberIds } },
        select: { id: true }
      });
      if (existingUsers.length !== initialMemberIds.length) {
        throw new ValidationError('One or more specified member user IDs do not exist');
      }
    }

    const initialDocIds = Array.from(new Set(data.documentSourceIds ?? []));
    const maxDocs = env.server?.GROUP_RAG_MAX_DOCUMENT_SOURCES ?? 100;
    if (initialDocIds.length > maxDocs) {
      throw new ValidationError(`Document source limit exceeded. Maximum: ${maxDocs}`);
    }
    if (initialDocIds.length > 0) {
      const userDocs = await prisma.document.findMany({
        where: { id: { in: initialDocIds }, userId },
        select: { id: true }
      });
      if (userDocs.length !== initialDocIds.length) {
        throw new AuthorizationError('Cannot attach documents that do not belong to you');
      }
    }

    const initialKbIds = Array.from(new Set(data.knowledgeBaseSourceIds ?? []));
    const maxKbs = env.server?.GROUP_RAG_MAX_KNOWLEDGE_BASE_SOURCES ?? 50;
    if (initialKbIds.length > maxKbs) {
      throw new ValidationError(`Knowledge Base source limit exceeded. Maximum: ${maxKbs}`);
    }
    if (initialKbIds.length > 0) {
      const userKbs = await prisma.knowledgeBase.findMany({
        where: { id: { in: initialKbIds }, userId },
        select: { id: true }
      });
      if (userKbs.length !== initialKbIds.length) {
        throw new AuthorizationError('Cannot attach Knowledge Bases that do not belong to you');
      }
    }

    const conversation = await prisma.ragConversation.create({
      data: {
        type: 'GROUP',
        createdById: userId,
        title: data.title.trim(),
        summary: data.summary?.trim() || null,
        members: {
          create: [
            { userId, role: 'OWNER' },
            ...initialMemberIds.filter((id) => id !== userId).map((id) => ({ userId: id, role: ProjectMemberRole.EDITOR }))
          ]
        },
        documentSources: {
          create: initialDocIds.map((docId) => ({ documentId: docId, addedByUserId: userId }))
        },
        knowledgeBaseSources: {
          create: initialKbIds.map((kbId) => ({ knowledgeBaseId: kbId, addedByUserId: userId }))
        }
      }
    });

    this.publishRealtimeEvent(conversation.id, 'rag:group_conversation_updated', {
      conversationId: conversation.id,
      action: 'created',
      title: conversation.title
    });

    return this.getGroupConversationDetails(userId, conversation.id);
  }

  public async listGroupConversations(userId: string): Promise<GroupConversationDetailsDTO[]> {
    this.ensureGroupRagEnabled();

    const conversations = await prisma.ragConversation.findMany({
      where: {
        type: 'GROUP',
        members: { some: { userId } }
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true }
    });

    return Promise.all(conversations.map((c) => this.getGroupConversationDetails(userId, c.id)));
  }

  public async getGroupConversationDetails(
    userId: string,
    conversationId: string
  ): Promise<GroupConversationDetailsDTO> {
    this.ensureGroupRagEnabled();

    const conversation = await prisma.ragConversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, email: true, name: true, avatarUrl: true }
            }
          }
        },
        documentSources: {
          include: {
            document: { select: { id: true, filename: true, fileSize: true, mimeType: true, createdAt: true } },
            addedBy: { select: { id: true, name: true, email: true } }
          }
        },
        knowledgeBaseSources: {
          include: {
            knowledgeBase: { select: { id: true, name: true, description: true, createdAt: true } },
            addedBy: { select: { id: true, name: true, email: true } }
          }
        },
        _count: { select: { messages: true } }
      }
    });

    if (!conversation || conversation.type !== 'GROUP') {
      throw new NotFoundError('Group conversation');
    }

    const callerMembership = conversation.members.find((m) => m.userId === userId);
    if (!callerMembership) {
      throw new AuthorizationError('Access denied to specified group conversation');
    }

    return {
      id: conversation.id,
      type: 'GROUP',
      title: conversation.title,
      summary: conversation.summary,
      createdById: conversation.createdById,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      userRole: callerMembership.role,
      members: conversation.members.map((m) => ({
        id: m.id,
        conversationId: m.conversationId,
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        user: {
          id: m.user.id,
          email: m.user.email,
          name: m.user.name,
          avatarUrl: m.user.avatarUrl
        }
      })),
      documentSources: conversation.documentSources.map((ds) => ({
        id: ds.id,
        conversationId: ds.conversationId,
        documentId: ds.documentId,
        addedByUserId: ds.addedByUserId,
        createdAt: ds.createdAt,
        document: ds.document,
        addedBy: {
          id: ds.addedBy.id,
          name: ds.addedBy.name,
          email: ds.addedBy.email
        }
      })),
      knowledgeBaseSources: conversation.knowledgeBaseSources.map((ks) => ({
        id: ks.id,
        conversationId: ks.conversationId,
        knowledgeBaseId: ks.knowledgeBaseId,
        addedByUserId: ks.addedByUserId,
        createdAt: ks.createdAt,
        knowledgeBase: ks.knowledgeBase,
        addedBy: {
          id: ks.addedBy.id,
          name: ks.addedBy.name,
          email: ks.addedBy.email
        }
      })),
      messageCount: conversation._count.messages
    };
  }

  public async updateGroupConversation(
    userId: string,
    conversationId: string,
    data: UpdateGroupConversationDTO
  ): Promise<GroupConversationDetailsDTO> {
    this.ensureGroupRagEnabled();
    await this.requireRole(userId, conversationId, ['OWNER', 'EDITOR']);

    if (data.title !== undefined) {
      if (!data.title.trim()) {
        throw new ValidationError('Group title cannot be empty');
      }
      if (data.title.trim().length > 100) {
        throw new ValidationError('Group title cannot exceed 100 characters');
      }
    }

    await prisma.ragConversation.update({
      where: { id: conversationId },
      data: {
        ...(data.title ? { title: data.title.trim() } : {}),
        ...(data.summary !== undefined ? { summary: data.summary?.trim() || null } : {})
      }
    });

    this.publishRealtimeEvent(conversationId, 'rag:group_conversation_updated', {
      conversationId,
      updatedBy: userId
    });

    return this.getGroupConversationDetails(userId, conversationId);
  }

  public async deleteGroupConversation(userId: string, conversationId: string): Promise<void> {
    this.ensureGroupRagEnabled();
    await this.requireRole(userId, conversationId, ['OWNER']);

    await prisma.ragConversation.delete({
      where: { id: conversationId }
    });

    await groupRagCacheService.invalidateGroupCache(conversationId);

    this.publishRealtimeEvent(conversationId, 'rag:group_conversation_deleted', {
      conversationId,
      deletedBy: userId
    });
  }

  // --- MEMBER MANAGEMENT ---

  public async addMember(
    userId: string,
    conversationId: string,
    targetUserId: string,
    role: ProjectMemberRole = ProjectMemberRole.EDITOR
  ): Promise<GroupMemberDTO> {
    this.ensureGroupRagEnabled();
    await this.requireRole(userId, conversationId, ['OWNER', 'EDITOR']);

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
    if (!targetUser) {
      throw new NotFoundError('User');
    }

    const existing = await prisma.ragConversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: targetUserId } }
    });
    if (existing) {
      throw new ValidationError('User is already a member of this group conversation');
    }

    const currentCount = await prisma.ragConversationMember.count({ where: { conversationId } });
    const maxMembers = env.server?.GROUP_RAG_MAX_MEMBERS ?? 50;
    if (currentCount >= maxMembers) {
      throw new ValidationError(`Member limit exceeded. Maximum: ${maxMembers}`);
    }

    const newMember = await prisma.ragConversationMember.create({
      data: { conversationId, userId: targetUserId, role },
      include: {
        user: { select: { id: true, email: true, name: true, avatarUrl: true } }
      }
    });

    this.publishRealtimeEvent(conversationId, 'rag:group_member_added', {
      conversationId,
      memberId: newMember.id,
      userId: targetUserId,
      role
    });

    return {
      id: newMember.id,
      conversationId: newMember.conversationId,
      userId: newMember.userId,
      role: newMember.role,
      joinedAt: newMember.joinedAt,
      user: {
        id: newMember.user.id,
        email: newMember.user.email,
        name: newMember.user.name,
        avatarUrl: newMember.user.avatarUrl
      }
    };
  }

  public async updateMemberRole(
    userId: string,
    conversationId: string,
    targetUserId: string,
    newRole: ProjectMemberRole
  ): Promise<GroupMemberDTO> {
    this.ensureGroupRagEnabled();
    await this.requireRole(userId, conversationId, ['OWNER']);

    const targetMembership = await prisma.ragConversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: targetUserId } }
    });
    if (!targetMembership) {
      throw new NotFoundError('Group member');
    }

    const updated = await prisma.ragConversationMember.update({
      where: { conversationId_userId: { conversationId, userId: targetUserId } },
      data: { role: newRole },
      include: {
        user: { select: { id: true, email: true, name: true, avatarUrl: true } }
      }
    });

    this.publishRealtimeEvent(conversationId, 'rag:group_member_role_updated', {
      conversationId,
      userId: targetUserId,
      newRole
    });

    return {
      id: updated.id,
      conversationId: updated.conversationId,
      userId: updated.userId,
      role: updated.role,
      joinedAt: updated.joinedAt,
      user: {
        id: updated.user.id,
        email: updated.user.email,
        name: updated.user.name,
        avatarUrl: updated.user.avatarUrl
      }
    };
  }

  public async removeMember(userId: string, conversationId: string, targetUserId: string): Promise<void> {
    this.ensureGroupRagEnabled();

    const isSelf = userId === targetUserId;
    const callerMembership = await this.requireRole(userId, conversationId, ['OWNER', 'EDITOR', 'VIEWER']);

    if (!isSelf && callerMembership.role === 'VIEWER') {
      throw new AuthorizationError('VIEWER role cannot remove other members');
    }

    const targetMembership = await prisma.ragConversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: targetUserId } }
    });
    if (!targetMembership) {
      throw new NotFoundError('Group member');
    }

    if (targetMembership.role === 'OWNER' && !isSelf) {
      throw new AuthorizationError('Cannot remove group owner');
    }

    if (targetMembership.role === 'OWNER' && isSelf) {
      const ownerCount = await prisma.ragConversationMember.count({
        where: { conversationId, role: 'OWNER' }
      });
      if (ownerCount <= 1) {
        throw new ValidationError('Sole owner cannot leave group. Transfer ownership or delete the group.');
      }
    }

    await prisma.ragConversationMember.delete({
      where: { conversationId_userId: { conversationId, userId: targetUserId } }
    });

    this.publishRealtimeEvent(conversationId, 'rag:group_member_removed', {
      conversationId,
      userId: targetUserId
    });
  }

  // --- SOURCE MANAGEMENT ---

  public async addDocumentSource(
    userId: string,
    conversationId: string,
    documentId: string
  ): Promise<GroupDocumentSourceDTO> {
    this.ensureGroupRagEnabled();
    await this.requireRole(userId, conversationId, ['OWNER', 'EDITOR']);

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, userId: true, filename: true, fileSize: true, mimeType: true, createdAt: true }
    });
    if (!document) {
      throw new NotFoundError('Document');
    }
    if (document.userId !== userId) {
      throw new AuthorizationError('You are not authorized to attach a document you do not own');
    }

    const currentCount = await prisma.ragConversationDocumentSource.count({ where: { conversationId } });
    const maxDocs = env.server?.GROUP_RAG_MAX_DOCUMENT_SOURCES ?? 100;
    if (currentCount >= maxDocs) {
      throw new ValidationError(`Document source limit exceeded. Maximum: ${maxDocs}`);
    }

    const existing = await prisma.ragConversationDocumentSource.findUnique({
      where: { conversationId_documentId: { conversationId, documentId } }
    });
    if (existing) {
      throw new ValidationError('Document is already attached to this conversation');
    }

    const newSource = await prisma.ragConversationDocumentSource.create({
      data: { conversationId, documentId, addedByUserId: userId },
      include: {
        document: { select: { id: true, filename: true, fileSize: true, mimeType: true, createdAt: true } },
        addedBy: { select: { id: true, name: true, email: true } }
      }
    });

    await groupRagCacheService.invalidateGroupCache(conversationId);

    this.publishRealtimeEvent(conversationId, 'rag:group_source_added', {
      conversationId,
      sourceType: 'DOCUMENT',
      sourceId: newSource.id,
      documentId
    });

    return {
      id: newSource.id,
      conversationId: newSource.conversationId,
      documentId: newSource.documentId,
      addedByUserId: newSource.addedByUserId,
      createdAt: newSource.createdAt,
      document: newSource.document,
      addedBy: {
        id: newSource.addedBy.id,
        name: newSource.addedBy.name,
        email: newSource.addedBy.email
      }
    };
  }

  public async removeDocumentSource(userId: string, conversationId: string, sourceId: string): Promise<void> {
    this.ensureGroupRagEnabled();
    await this.requireRole(userId, conversationId, ['OWNER', 'EDITOR']);

    const source = await prisma.ragConversationDocumentSource.findUnique({
      where: { id: sourceId }
    });
    if (!source || source.conversationId !== conversationId) {
      throw new NotFoundError('Document source');
    }

    await prisma.ragConversationDocumentSource.delete({
      where: { id: sourceId }
    });

    await groupRagCacheService.invalidateGroupCache(conversationId);

    this.publishRealtimeEvent(conversationId, 'rag:group_source_removed', {
      conversationId,
      sourceType: 'DOCUMENT',
      sourceId
    });
  }

  public async addKBSource(
    userId: string,
    conversationId: string,
    knowledgeBaseId: string
  ): Promise<GroupKBSourceDTO> {
    this.ensureGroupRagEnabled();
    await this.requireRole(userId, conversationId, ['OWNER', 'EDITOR']);

    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      select: { id: true, userId: true, name: true, description: true, createdAt: true }
    });
    if (!kb) {
      throw new NotFoundError('Knowledge Base');
    }
    if (kb.userId !== userId) {
      throw new AuthorizationError('You are not authorized to attach a Knowledge Base you do not own');
    }

    const currentCount = await prisma.ragConversationKnowledgeBaseSource.count({ where: { conversationId } });
    const maxKbs = env.server?.GROUP_RAG_MAX_KNOWLEDGE_BASE_SOURCES ?? 50;
    if (currentCount >= maxKbs) {
      throw new ValidationError(`Knowledge Base source limit exceeded. Maximum: ${maxKbs}`);
    }

    const existing = await prisma.ragConversationKnowledgeBaseSource.findUnique({
      where: { conversationId_knowledgeBaseId: { conversationId, knowledgeBaseId } }
    });
    if (existing) {
      throw new ValidationError('Knowledge Base is already attached to this conversation');
    }

    const newSource = await prisma.ragConversationKnowledgeBaseSource.create({
      data: { conversationId, knowledgeBaseId, addedByUserId: userId },
      include: {
        knowledgeBase: { select: { id: true, name: true, description: true, createdAt: true } },
        addedBy: { select: { id: true, name: true, email: true } }
      }
    });

    await groupRagCacheService.invalidateGroupCache(conversationId);

    this.publishRealtimeEvent(conversationId, 'rag:group_source_added', {
      conversationId,
      sourceType: 'KNOWLEDGE_BASE',
      sourceId: newSource.id,
      knowledgeBaseId
    });

    return {
      id: newSource.id,
      conversationId: newSource.conversationId,
      knowledgeBaseId: newSource.knowledgeBaseId,
      addedByUserId: newSource.addedByUserId,
      createdAt: newSource.createdAt,
      knowledgeBase: newSource.knowledgeBase,
      addedBy: {
        id: newSource.addedBy.id,
        name: newSource.addedBy.name,
        email: newSource.addedBy.email
      }
    };
  }

  public async removeKBSource(userId: string, conversationId: string, sourceId: string): Promise<void> {
    this.ensureGroupRagEnabled();
    await this.requireRole(userId, conversationId, ['OWNER', 'EDITOR']);

    const source = await prisma.ragConversationKnowledgeBaseSource.findUnique({
      where: { id: sourceId }
    });
    if (!source || source.conversationId !== conversationId) {
      throw new NotFoundError('Knowledge Base source');
    }

    await prisma.ragConversationKnowledgeBaseSource.delete({
      where: { id: sourceId }
    });

    await groupRagCacheService.invalidateGroupCache(conversationId);

    this.publishRealtimeEvent(conversationId, 'rag:group_source_removed', {
      conversationId,
      sourceType: 'KNOWLEDGE_BASE',
      sourceId
    });
  }

  // --- MESSAGES & AI QUESTIONS ---

  public async getMessages(
    userId: string,
    conversationId: string,
    limit = 50,
    cursor?: string
  ): Promise<GroupMessageDTO[]> {
    this.ensureGroupRagEnabled();
    await this.requireRole(userId, conversationId, ['OWNER', 'EDITOR', 'VIEWER']);

    const messages = await prisma.ragMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: Math.min(limit, 100),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
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

  public async sendMessage(userId: string, conversationId: string, content: string): Promise<GroupMessageDTO> {
    this.ensureGroupRagEnabled();
    const membership = await this.requireRole(userId, conversationId, ['OWNER', 'EDITOR', 'VIEWER']);
    if (membership.role === 'VIEWER') {
      throw new AuthorizationError('VIEWER role cannot post messages to group conversation');
    }

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

    this.publishRealtimeEvent(conversationId, 'rag:group_conversation_message_created', {
      conversationId,
      messageId: message.id,
      authorId: userId,
      role: 'USER',
      content: message.content
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
    conversationId: string,
    question: string,
    opts?: { model?: string }
  ): Promise<{ userMessage: GroupMessageDTO; assistantMessage: GroupMessageDTO }> {
    this.ensureGroupRagEnabled();
    const membership = await this.requireRole(userId, conversationId, ['OWNER', 'EDITOR', 'VIEWER']);
    if (membership.role === 'VIEWER') {
      throw new AuthorizationError('VIEWER role cannot ask AI questions');
    }

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

    this.publishRealtimeEvent(conversationId, 'rag:group_conversation_message_created', {
      conversationId,
      messageId: userMessage.id,
      authorId: userId,
      role: 'USER',
      content: userMessage.content
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

    this.publishRealtimeEvent(conversationId, 'rag:group_ai_response_created', {
      conversationId,
      messageId: assistantMessage.id,
      role: 'ASSISTANT',
      content: assistantMessage.content,
      citations: assistantMessage.citations
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

  private async requireRole(
    userId: string,
    conversationId: string,
    allowedRoles: ProjectMemberRole[]
  ) {
    const membership = await prisma.ragConversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } }
    });

    if (!membership || !allowedRoles.includes(membership.role)) {
      throw new AuthorizationError('Insufficient permissions in this group conversation');
    }

    return membership;
  }

  private publishRealtimeEvent(channelId: string, type: any, data: unknown): void {
    if (env.server?.GROUP_RAG_REALTIME_ENABLED === false) return;
    try {
      collabPubSubService.publish(channelId, {
        type,
        channelId,
        data,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      console.warn('[GroupRagService] Realtime broadcast error:', err);
    }
  }
}

export const groupRagService = new GroupRagService();
