import { ProjectMemberRole } from '@prisma/client';
import { AuthorizationError } from '@/errors';
import { projectService } from '@/features/projects/project.service';

export type ProjectPermission =
  | 'VIEW_PROJECT'
  | 'EDIT_PROJECT'
  | 'DELETE_PROJECT'
  | 'MANAGE_MEMBERS'
  | 'MANAGE_ROLES'
  | 'ATTACH_SOURCES'
  | 'REMOVE_SOURCES'
  | 'CREATE_CONVERSATION'
  | 'DELETE_CONVERSATION'
  | 'POST_MESSAGE'
  | 'ASK_AI'
  | 'VIEW_AUDIT_LOGS';

export class ProjectAuthorizationService {
  /**
   * Resolves a user's role in a project.
   * Returns undefined if the user is not a member or project owner.
   */
  public async getUserRole(userId: string, projectId: string): Promise<ProjectMemberRole | undefined> {
    return projectService.getUserProjectRole(projectId, userId);
  }

  /**
   * Evaluates if a role possesses a specific permission.
   * Defaults to fail-closed (returns false for undefined role).
   */
  public hasPermission(role: ProjectMemberRole | undefined, permission: ProjectPermission): boolean {
    if (!role) return false;

    switch (permission) {
      case 'VIEW_PROJECT':
        return true; // OWNER, ADMIN, EDITOR, VIEWER

      case 'EDIT_PROJECT':
      case 'ATTACH_SOURCES':
      case 'REMOVE_SOURCES':
      case 'CREATE_CONVERSATION':
      case 'POST_MESSAGE':
        return role === 'OWNER' || role === 'ADMIN' || role === 'EDITOR';

      case 'ASK_AI':
        return role === 'OWNER' || role === 'ADMIN' || role === 'EDITOR' || role === 'VIEWER';

      case 'MANAGE_MEMBERS':
      case 'MANAGE_ROLES':
      case 'DELETE_CONVERSATION':
      case 'VIEW_AUDIT_LOGS':
        return role === 'OWNER' || role === 'ADMIN';

      case 'DELETE_PROJECT':
        return role === 'OWNER';

      default:
        return false;
    }
  }

  /**
   * Authorizes a user request against a project permission.
   * Throws AuthorizationError or NotFoundError if authorization fails.
   */
  public async authorizeProjectAccess(
    userId: string,
    projectId: string,
    permission: ProjectPermission
  ): Promise<ProjectMemberRole> {
    const role = await this.getUserRole(userId, projectId);

    if (!role || !this.hasPermission(role, permission)) {
      throw new AuthorizationError(
        `Access denied. Insufficient permissions for action '${permission}' in project '${projectId}'.`
      );
    }

    return role;
  }
}

export const projectAuthorizationService = new ProjectAuthorizationService();
