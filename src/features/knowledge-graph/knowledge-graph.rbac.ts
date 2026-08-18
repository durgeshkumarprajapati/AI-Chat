import { UserRole } from '@prisma/client';
import { knowledgeGraphSecurityService } from './security/knowledge-graph-security.service';

export class KnowledgeGraphRBAC {
  public async canViewGraph(userId: string, userRole: UserRole, projectId?: string | null): Promise<boolean> {
    return knowledgeGraphSecurityService.authorizeGraphAccess(userId, userRole, projectId, 'READ');
  }

  public async canMutateGraph(userId: string, userRole: UserRole, projectId?: string | null): Promise<boolean> {
    return knowledgeGraphSecurityService.authorizeGraphAccess(userId, userRole, projectId, 'WRITE');
  }

  public async canAdministerGraph(userId: string, userRole: UserRole, projectId?: string | null): Promise<boolean> {
    return knowledgeGraphSecurityService.authorizeGraphAccess(userId, userRole, projectId, 'ADMIN');
  }
}

export const knowledgeGraphRBAC = new KnowledgeGraphRBAC();
