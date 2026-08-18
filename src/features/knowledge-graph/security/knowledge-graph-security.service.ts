import { prisma } from '@/lib/prisma';
import { UserRole } from '@prisma/client';

export class KnowledgeGraphSecurityService {
  /**
   * Enforces server-side user/project authorization before querying or mutating graph resources.
   */
  public async authorizeGraphAccess(
    userId: string,
    userRole: UserRole,
    projectId?: string | null,
    requiredPermission: 'READ' | 'WRITE' | 'ADMIN' = 'READ'
  ): Promise<boolean> {
    if (!userId) return false;

    // Platform Admin has full read access
    if (userRole === 'ADMIN' && requiredPermission === 'READ') {
      return true;
    }

    if (!projectId) {
      // User-level scope: strictly user's own knowledge
      return true;
    }

    // Project-level scope: verify ProjectMembership and role
    const member = await prisma.projectMember.findFirst({
      where: {
        projectId,
        userId
      }
    });

    if (!member) {
      const project = await prisma.project.findFirst({
        where: { id: projectId, ownerId: userId }
      });
      return !!project;
    }

    if (requiredPermission === 'READ') {
      return true; // OWNER, EDITOR, VIEWER can read
    }

    if (requiredPermission === 'WRITE') {
      return member.role === 'OWNER' || member.role === 'EDITOR';
    }

    if (requiredPermission === 'ADMIN') {
      return member.role === 'OWNER';
    }

    return false;
  }
}

export const knowledgeGraphSecurityService = new KnowledgeGraphSecurityService();
