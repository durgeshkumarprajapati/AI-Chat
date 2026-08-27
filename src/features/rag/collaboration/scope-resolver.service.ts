import { prisma } from '@/lib/prisma';
import { NotFoundError, AuthorizationError } from '@/errors';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { RetrievalScope } from './retrieval-scope.types';

/**
 * The single entry point for resolving an authorized retrieval scope. Always either throws
 * (AuthorizationError/NotFoundError) or returns a fully-authorized RetrievalScope — there is no
 * code path that reaches retrieval with an unresolved/unauthorized scope. GROUP resolution is
 * implemented in Phase 71B; until then it throws (fail closed, never silently permissive).
 */
export class ScopeResolverService {
  public async resolveScope(userId: string, ragConversationId: string): Promise<RetrievalScope> {
    const conversation = await prisma.ragConversation.findUnique({
      where: { id: ragConversationId },
      select: { id: true, type: true, projectId: true, knowledgeBaseId: true, createdById: true }
    });

    if (!conversation) {
      throw new NotFoundError('Conversation');
    }

    switch (conversation.type) {
      case 'PRIVATE':
        return this.resolvePrivateScope(userId, conversation);
      case 'GROUP':
        return this.resolveGroupScope(userId, conversation);
      case 'PROJECT':
        return this.resolveProjectScope(userId, conversation);
      default:
        throw new AuthorizationError('Unknown conversation type');
    }
  }

  private async resolvePrivateScope(
    userId: string,
    conversation: { id: string; knowledgeBaseId: string | null }
  ): Promise<RetrievalScope> {
    const membership = await prisma.ragConversationMember.findUnique({
      where: { conversationId_userId: { conversationId: conversation.id, userId } }
    });

    if (!membership) {
      throw new AuthorizationError('Access denied to specified conversation');
    }

    return {
      userId,
      conversationId: conversation.id,
      conversationType: 'PRIVATE',
      authorizedDocumentIds: undefined,
      authorizedKnowledgeBaseIds: undefined,
      allowWebSearch: true,
      allowKnowledgeGraph: false,
      isHardScoped: false
    };
  }

  private async resolveGroupScope(
    userId: string,
    conversation: { id: string; knowledgeBaseId: string | null }
  ): Promise<RetrievalScope> {
    const membership = await prisma.ragConversationMember.findUnique({
      where: { conversationId_userId: { conversationId: conversation.id, userId } }
    });

    if (!membership) {
      throw new AuthorizationError('Not a member of this group conversation');
    }

    const [docSources, kbSources] = await Promise.all([
      prisma.ragConversationDocumentSource.findMany({
        where: { conversationId: conversation.id },
        select: { documentId: true }
      }),
      prisma.ragConversationKnowledgeBaseSource.findMany({
        where: { conversationId: conversation.id },
        select: { knowledgeBaseId: true }
      })
    ]);

    const attachedDocIds = docSources.map((ds) => ds.documentId);
    const attachedKbIds = kbSources.map((ks) => ks.knowledgeBaseId);

    const kbDocIds = attachedKbIds.length
      ? (
          await prisma.knowledgeBaseDocument.findMany({
            where: { knowledgeBaseId: { in: attachedKbIds } },
            select: { documentId: true }
          })
        ).map((kbd) => kbd.documentId)
      : [];

    const authorizedDocumentIds = Array.from(new Set([...attachedDocIds, ...kbDocIds]));

    return {
      userId,
      conversationId: conversation.id,
      conversationType: 'GROUP',
      authorizedDocumentIds,
      authorizedKnowledgeBaseIds: attachedKbIds,
      allowWebSearch: true,
      allowKnowledgeGraph: false,
      isHardScoped: true
    };
  }

  private async resolveProjectScope(
    userId: string,
    conversation: { id: string; projectId: string | null; knowledgeBaseId: string | null }
  ): Promise<RetrievalScope> {
    if (!conversation.projectId) {
      throw new AuthorizationError('Not a valid project conversation');
    }

    await projectAuthorizationService.authorizeProjectAccess(userId, conversation.projectId, 'VIEW_PROJECT');

    const [projectDocs, projectKbs] = await Promise.all([
      prisma.projectDocument.findMany({ where: { projectId: conversation.projectId }, select: { documentId: true } }),
      prisma.projectKnowledgeBase.findMany({ where: { projectId: conversation.projectId }, select: { knowledgeBaseId: true } })
    ]);

    const kbIds = projectKbs.map((k) => k.knowledgeBaseId);
    const kbDocs = kbIds.length
      ? await prisma.knowledgeBaseDocument.findMany({
          where: { knowledgeBaseId: { in: kbIds } },
          select: { documentId: true }
        })
      : [];

    const authorizedDocumentIds = Array.from(
      new Set([...projectDocs.map((d) => d.documentId), ...kbDocs.map((d) => d.documentId)])
    );

    return {
      userId,
      conversationId: conversation.id,
      conversationType: 'PROJECT',
      projectId: conversation.projectId,
      authorizedDocumentIds,
      authorizedKnowledgeBaseIds: kbIds,
      allowWebSearch: true,
      allowKnowledgeGraph: false,
      isHardScoped: true
    };
  }
}

export const scopeResolverService = new ScopeResolverService();
