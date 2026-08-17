import { ProjectMemberRole } from './types/project.types';

export class ProjectRbacService {
  public static canViewProject(userRole?: ProjectMemberRole): boolean {
    return userRole === 'OWNER' || userRole === 'EDITOR' || userRole === 'VIEWER';
  }

  public static canEditProject(userRole?: ProjectMemberRole): boolean {
    return userRole === 'OWNER' || userRole === 'EDITOR';
  }

  public static canManageMembers(userRole?: ProjectMemberRole): boolean {
    return userRole === 'OWNER';
  }

  public static canDeleteProject(userRole?: ProjectMemberRole): boolean {
    return userRole === 'OWNER';
  }

  public static canExecuteMutatingCopilotAction(userRole?: ProjectMemberRole): boolean {
    return userRole === 'OWNER' || userRole === 'EDITOR';
  }
}
