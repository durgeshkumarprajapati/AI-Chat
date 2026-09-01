import { AssistantConversation, AssistantMessageRole, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { NotFoundError, ValidationError } from '@/errors';
import { auditService } from '@/features/audit/audit.service';
import { configService } from '@/features/config/config.service';
import { AssistantConversationSummaryDTO, AssistantMessageDTO, AssistantScope } from '../types/assistant.types';

/**
 * Phase 89 — AssistantConversation/AssistantMessage persistence.
 *
 * Every read/write here is scoped to the requesting `userId` — a conversation not owned by the
 * caller is treated as NotFound (404), never AuthorizationError (403), so a non-owned id never
 * leaks its existence to a probing caller.
 */
export class AssistantConversationService {
  /** Loads an existing, owned, non-deleted conversation, or creates a new one. */
  public async loadOrCreate(
    userId: string,
    opts: { conversationId?: string; scope?: AssistantScope; projectId?: string }
  ): Promise<AssistantConversation> {
    if (opts.conversationId) {
      const conv = await prisma.assistantConversation.findFirst({
        where: { id: opts.conversationId, userId, isDeleted: false }
      });
      if (!conv) throw new NotFoundError('Conversation');
      return conv;
    }

    return prisma.assistantConversation.create({
      data: {
        userId,
        scope: (opts.scope as any) || 'GLOBAL',
        projectId: opts.projectId || null,
        title: 'New conversation'
      }
    });
  }

  /** Bounded, most-recent, select-projected window of prior turns — never the full table. */
  public async loadRecentMessages(conversationId: string): Promise<Array<{ role: AssistantMessageRole; content: string; createdAt: Date }>> {
    const maxMessages = await configService.getNumber('AI_ASSISTANT_MAX_CONVERSATION_MESSAGES', 50);
    const messages = await prisma.assistantMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(maxMessages, 5), 200),
      select: { role: true, content: true, createdAt: true }
    });
    return messages.reverse();
  }

  public async persistMessage(
    conversationId: string,
    role: AssistantMessageRole,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<{ id: string; createdAt: Date }> {
    const sanitizedMetadata = metadata ? (auditService.sanitizeMetadata(metadata) as Prisma.InputJsonValue) : undefined;
    const message = await prisma.assistantMessage.create({
      data: {
        conversationId,
        role,
        content,
        metadataJson: sanitizedMetadata ?? {}
      },
      select: { id: true, createdAt: true }
    });

    await prisma.assistantConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: message.createdAt, updatedAt: new Date() }
    });

    return message;
  }

  /** Best-effort title assignment from the first user message — never blocks the chat turn. */
  public async maybeSetInitialTitle(conversationId: string, firstMessage: string): Promise<void> {
    try {
      const conv = await prisma.assistantConversation.findUnique({ where: { id: conversationId }, select: { title: true } });
      if (!conv || conv.title !== 'New conversation') return;
      const title = firstMessage.trim().slice(0, 80) || 'New conversation';
      await prisma.assistantConversation.update({ where: { id: conversationId }, data: { title } });
    } catch {
      // best-effort only
    }
  }

  public async listConversations(
    userId: string,
    opts: { limit?: number; offset?: number }
  ): Promise<{ items: AssistantConversationSummaryDTO[]; total: number }> {
    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
    const offset = Math.max(opts.offset ?? 0, 0);

    const [rows, total] = await Promise.all([
      prisma.assistantConversation.findMany({
        where: { userId, isDeleted: false },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
        select: { id: true, title: true, scope: true, projectId: true, lastMessageAt: true, createdAt: true, updatedAt: true }
      }),
      prisma.assistantConversation.count({ where: { userId, isDeleted: false } })
    ]);

    return {
      items: rows.map((c) => ({
        id: c.id,
        title: c.title,
        scope: c.scope as AssistantScope,
        projectId: c.projectId,
        lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString()
      })),
      total
    };
  }

  public async createEmptyConversation(userId: string, scope?: AssistantScope, projectId?: string): Promise<AssistantConversationSummaryDTO> {
    const conv = await prisma.assistantConversation.create({
      data: { userId, scope: (scope as any) || 'GLOBAL', projectId: projectId || null }
    });
    return {
      id: conv.id,
      title: conv.title,
      scope: conv.scope as AssistantScope,
      projectId: conv.projectId,
      lastMessageAt: null,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString()
    };
  }

  public async getConversationDetail(userId: string, conversationId: string): Promise<AssistantConversationSummaryDTO> {
    const conv = await prisma.assistantConversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false }
    });
    if (!conv) throw new NotFoundError('Conversation');

    return {
      id: conv.id,
      title: conv.title,
      scope: conv.scope as AssistantScope,
      projectId: conv.projectId,
      lastMessageAt: conv.lastMessageAt ? conv.lastMessageAt.toISOString() : null,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString()
    };
  }

  public async getMessages(
    userId: string,
    conversationId: string,
    opts: { limit?: number; offset?: number }
  ): Promise<{ items: AssistantMessageDTO[]; total: number }> {
    const conv = await prisma.assistantConversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
      select: { id: true }
    });
    if (!conv) throw new NotFoundError('Conversation');

    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);

    const [rows, total] = await Promise.all([
      prisma.assistantMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        take: limit,
        skip: offset
      }),
      prisma.assistantMessage.count({ where: { conversationId } })
    ]);

    return {
      items: rows.map((m) => ({
        id: m.id,
        role: m.role as AssistantMessageDTO['role'],
        content: m.content,
        metadata: (m.metadataJson as Record<string, unknown>) || {},
        createdAt: m.createdAt.toISOString()
      })),
      total
    };
  }

  public async deleteConversation(userId: string, conversationId: string): Promise<void> {
    const conv = await prisma.assistantConversation.findFirst({
      where: { id: conversationId, userId, isDeleted: false },
      select: { id: true }
    });
    if (!conv) throw new NotFoundError('Conversation');

    await prisma.assistantConversation.update({
      where: { id: conversationId },
      data: { isDeleted: true }
    });

    await auditService.logEvent({
      actorId: userId,
      action: 'ASSISTANT_CONVERSATION_DELETED',
      targetType: 'ASSISTANT_CONVERSATION',
      targetId: conversationId
    });
  }

  public validateMessageLength(message: string, maxLength: number): void {
    if (!message || !message.trim()) {
      throw new ValidationError('message cannot be empty.');
    }
    if (message.length > maxLength) {
      throw new ValidationError(`message must be ${maxLength} characters or fewer.`);
    }
  }
}

export const assistantConversationService = new AssistantConversationService();
