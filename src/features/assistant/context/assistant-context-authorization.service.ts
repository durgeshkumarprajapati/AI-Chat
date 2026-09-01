import { UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { knowledgeGraphRBAC } from '@/features/knowledge-graph/knowledge-graph.rbac';
import { AssistantContextHint, AuthorizedAssistantContext } from '../types/assistant.types';

/**
 * Phase 89 — independent re-authorization of every client-supplied AssistantContextHint field.
 *
 * SECURITY: `contextHint` is a CLIENT HINT ONLY (e.g. "user is currently viewing project X").
 * Every non-empty field is independently re-verified here against the OWNING system's own real
 * authorization primitive before it is trusted for anything. A hint that fails its check is
 * silently DROPPED — never causes the whole request to fail, and never surfaces a 403 that would
 * confirm/deny the existence of a resource to a caller probing ids (this is why every branch
 * below is fail-closed-and-silent, not fail-loud).
 */
export class AssistantContextAuthorizationService {
  public async authorize(
    userId: string,
    userRole: UserRole,
    hint?: AssistantContextHint
  ): Promise<AuthorizedAssistantContext> {
    if (!hint) return {};

    const [projectId, documentId, knowledgeBaseId, meetingId, knowledgeEntityId, automationId] = await Promise.all([
      this.authorizeProject(userId, hint.projectId),
      this.authorizeDocument(userId, hint.documentId),
      this.authorizeKnowledgeBase(userId, hint.knowledgeBaseId),
      this.authorizeMeeting(userId, hint.meetingId),
      this.authorizeKnowledgeEntity(userId, userRole, hint.knowledgeEntityId),
      this.authorizeAutomation(userId, hint.automationId)
    ]);

    const authorized: AuthorizedAssistantContext = {};
    if (projectId) authorized.projectId = projectId;
    if (documentId) authorized.documentId = documentId;
    if (knowledgeBaseId) authorized.knowledgeBaseId = knowledgeBaseId;
    if (meetingId) authorized.meetingId = meetingId;
    if (knowledgeEntityId) authorized.knowledgeEntityId = knowledgeEntityId;
    if (automationId) authorized.automationId = automationId;
    return authorized;
  }

  private async authorizeProject(userId: string, projectId?: string): Promise<string | undefined> {
    if (!projectId) return undefined;
    try {
      await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'VIEW_PROJECT');
      return projectId;
    } catch {
      return undefined;
    }
  }

  private async authorizeDocument(userId: string, documentId?: string): Promise<string | undefined> {
    if (!documentId) return undefined;
    try {
      const doc = await prisma.document.findFirst({ where: { id: documentId, userId, isDeleted: false }, select: { id: true } });
      return doc ? documentId : undefined;
    } catch {
      return undefined;
    }
  }

  private async authorizeKnowledgeBase(userId: string, knowledgeBaseId?: string): Promise<string | undefined> {
    if (!knowledgeBaseId) return undefined;
    try {
      const kb = await prisma.knowledgeBase.findFirst({ where: { id: knowledgeBaseId, userId }, select: { id: true } });
      return kb ? knowledgeBaseId : undefined;
    } catch {
      return undefined;
    }
  }

  private async authorizeMeeting(userId: string, meetingId?: string): Promise<string | undefined> {
    if (!meetingId) return undefined;
    try {
      const meeting = await prisma.meeting.findFirst({ where: { id: meetingId, userId }, select: { id: true } });
      return meeting ? meetingId : undefined;
    } catch {
      return undefined;
    }
  }

  private async authorizeKnowledgeEntity(userId: string, userRole: UserRole, knowledgeEntityId?: string): Promise<string | undefined> {
    if (!knowledgeEntityId) return undefined;
    try {
      const entity = await prisma.knowledgeEntity.findUnique({
        where: { id: knowledgeEntityId },
        select: { id: true, userId: true, projectId: true, status: true }
      });
      if (!entity || entity.status !== 'ACTIVE') return undefined;

      if (entity.projectId) {
        const allowed = await knowledgeGraphRBAC.canViewGraph(userId, userRole, entity.projectId);
        return allowed ? knowledgeEntityId : undefined;
      }
      // No project — private-scope entity, owner-only.
      return entity.userId === userId ? knowledgeEntityId : undefined;
    } catch {
      return undefined;
    }
  }

  private async authorizeAutomation(userId: string, automationId?: string): Promise<string | undefined> {
    if (!automationId) return undefined;
    try {
      const automation = await prisma.automation.findFirst({ where: { id: automationId, userId }, select: { id: true } });
      return automation ? automationId : undefined;
    } catch {
      return undefined;
    }
  }
}

export const assistantContextAuthorizationService = new AssistantContextAuthorizationService();
