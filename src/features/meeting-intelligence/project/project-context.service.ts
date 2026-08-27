import { prisma } from '@/lib/prisma';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { meetingIntelligenceConfig } from '../meeting-intelligence.config';

export class ProjectContextService {
  public async getAuthorizedProjectContext(userId: string, projectId: string): Promise<string | null> {
    if (!meetingIntelligenceConfig.isProjectContextEnabled) {
      return null;
    }

    // Strict authorization check
    await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'VIEW_PROJECT');

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        documents: {
          take: 5,
          include: { document: { select: { filename: true, originalFilename: true } } }
        },
        knowledgeBases: {
          take: 3,
          include: { knowledgeBase: { select: { name: true, description: true } } }
        }
      }
    });

    if (!project) return null;

    const docNames = project.documents
      .map((d) => d.document?.originalFilename || d.document?.filename)
      .filter(Boolean)
      .join(', ');

    const kbNames = project.knowledgeBases
      .map((kb) => kb.knowledgeBase?.name)
      .filter(Boolean)
      .join(', ');

    return `Project Name: ${project.name}
Description: ${project.description || 'N/A'}
Associated Documents: ${docNames || 'None'}
Knowledge Bases: ${kbNames || 'None'}`;
  }
}

export const projectContextService = new ProjectContextService();
