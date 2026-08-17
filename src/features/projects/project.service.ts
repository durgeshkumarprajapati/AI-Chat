import { prisma } from '@/lib/prisma';
import {
  CreateProjectPayload,
  ProjectDetail,
  ProjectMemberRole,
  ProjectSummary,
  UpdateProjectPayload
} from './types/project.types';

export class ProjectService {
  /**
   * Get user's role in a project. Returns undefined if not a member or owner.
   */
  public async getUserProjectRole(projectId: string, userId: string): Promise<ProjectMemberRole | undefined> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true }
    });

    if (!project) return undefined;
    if (project.ownerId === userId) return 'OWNER';

    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId, userId }
      },
      select: { role: true }
    });

    return member?.role as ProjectMemberRole | undefined;
  }

  /**
   * Create a new project workspace.
   */
  public async createProject(userId: string, payload: CreateProjectPayload): Promise<ProjectDetail> {
    const project = await prisma.project.create({
      data: {
        ownerId: userId,
        name: payload.name,
        description: payload.description,
        members: {
          create: {
            userId,
            role: 'OWNER'
          }
        },
        documents: payload.documentIds?.length
          ? {
              create: payload.documentIds.map((docId) => ({ documentId: docId }))
            }
          : undefined,
        knowledgeBases: payload.knowledgeBaseIds?.length
          ? {
              create: payload.knowledgeBaseIds.map((kbId) => ({ knowledgeBaseId: kbId }))
            }
          : undefined,
        roadmaps: payload.roadmapIds?.length
          ? {
              create: payload.roadmapIds.map((rId) => ({ roadmapId: rId }))
            }
          : undefined,
        studySessions: payload.studySessionIds?.length
          ? {
              create: payload.studySessionIds.map((sId) => ({ studySessionId: sId }))
            }
          : undefined,
        researchSessions: payload.researchSessionIds?.length
          ? {
              create: payload.researchSessionIds.map((resId) => ({ researchSessionId: resId }))
            }
          : undefined,
        workflows: payload.workflowIds?.length
          ? {
              create: payload.workflowIds.map((wfId) => ({ workflowId: wfId }))
            }
          : undefined
      }
    });

    return this.getProjectById(project.id, userId);
  }

  /**
   * Get all projects accessible by user (owned or member).
   */
  public async getUserProjects(userId: string): Promise<ProjectSummary[]> {
    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { ownerId: userId },
          { members: { some: { userId } } }
        ]
      },
      include: {
        owner: { select: { name: true, email: true } },
        _count: {
          select: {
            members: true,
            documents: true,
            knowledgeBases: true,
            roadmaps: true,
            studySessions: true,
            researchSessions: true,
            workflows: true,
            conversations: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    return projects.map((p) => ({
      id: p.id,
      ownerId: p.ownerId,
      name: p.name,
      description: p.description,
      status: p.status as any,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      ownerName: p.owner.name || p.owner.email,
      memberCount: p._count.members,
      documentCount: p._count.documents,
      knowledgeBaseCount: p._count.knowledgeBases,
      roadmapCount: p._count.roadmaps,
      studySessionCount: p._count.studySessions,
      researchSessionCount: p._count.researchSessions,
      workflowCount: p._count.workflows,
      conversationCount: p._count.conversations
    }));
  }

  /**
   * Get project details by ID with access check.
   */
  public async getProjectById(projectId: string, userId: string): Promise<ProjectDetail> {
    const role = await this.getUserProjectRole(projectId, userId);
    if (!role) {
      throw new Error('Project not found or unauthorized access');
    }

    const p = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        owner: { select: { name: true, email: true } },
        members: {
          include: {
            user: { select: { name: true, email: true } }
          }
        },
        documents: {
          include: {
            document: { select: { id: true, filename: true, mimeType: true, createdAt: true } }
          }
        },
        knowledgeBases: {
          include: {
            knowledgeBase: { select: { id: true, name: true, createdAt: true } }
          }
        },
        roadmaps: {
          include: {
            roadmap: { select: { id: true, title: true, createdAt: true } }
          }
        },
        studySessions: {
          include: {
            studySession: { select: { id: true, title: true, difficulty: true, createdAt: true } }
          }
        },
        researchSessions: {
          include: {
            researchSession: { select: { id: true, title: true, status: true, createdAt: true } }
          }
        },
        workflows: {
          include: {
            workflow: { select: { id: true, name: true, status: true, createdAt: true } }
          }
        },
        conversations: {
          include: {
            conversation: { select: { id: true, title: true, createdAt: true } }
          }
        },
        _count: {
          select: {
            members: true,
            documents: true,
            knowledgeBases: true,
            roadmaps: true,
            studySessions: true,
            researchSessions: true,
            workflows: true,
            conversations: true
          }
        }
      }
    });

    if (!p) throw new Error('Project not found');

    return {
      id: p.id,
      ownerId: p.ownerId,
      name: p.name,
      description: p.description,
      status: p.status as any,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      ownerName: p.owner.name || p.owner.email,
      memberCount: p._count.members,
      documentCount: p._count.documents,
      knowledgeBaseCount: p._count.knowledgeBases,
      roadmapCount: p._count.roadmaps,
      studySessionCount: p._count.studySessions,
      researchSessionCount: p._count.researchSessions,
      workflowCount: p._count.workflows,
      conversationCount: p._count.conversations,
      members: p.members.map((m) => ({
        id: m.id,
        projectId: m.projectId,
        userId: m.userId,
        role: m.role as any,
        userEmail: m.user.email,
        userName: m.user.name || undefined,
        createdAt: m.createdAt
      })),
      documents: p.documents.map((d) => ({
        id: d.id,
        documentId: d.documentId,
        filename: d.document.filename,
        mimeType: d.document.mimeType,
        createdAt: d.createdAt
      })),
      knowledgeBases: p.knowledgeBases.map((kb) => ({
        id: kb.id,
        knowledgeBaseId: kb.knowledgeBaseId,
        name: kb.knowledgeBase.name,
        createdAt: kb.createdAt
      })),
      roadmaps: p.roadmaps.map((r) => ({
        id: r.id,
        roadmapId: r.roadmapId,
        title: r.roadmap.title,
        createdAt: r.createdAt
      })),
      studySessions: p.studySessions.map((s) => ({
        id: s.id,
        studySessionId: s.studySessionId,
        title: s.studySession.title,
        difficulty: s.studySession.difficulty,
        createdAt: s.createdAt
      })),
      researchSessions: p.researchSessions.map((res) => ({
        id: res.id,
        researchSessionId: res.researchSessionId,
        title: res.researchSession.title,
        status: res.researchSession.status,
        createdAt: res.createdAt
      })),
      workflows: p.workflows.map((wf) => ({
        id: wf.id,
        workflowId: wf.workflowId,
        name: wf.workflow.name,
        status: wf.workflow.status,
        createdAt: wf.createdAt
      })),
      conversations: p.conversations.map((c) => ({
        id: c.id,
        conversationId: c.conversationId,
        title: c.conversation.title,
        createdAt: c.createdAt
      }))
    };
  }

  /**
   * Update project metadata.
   */
  public async updateProject(projectId: string, userId: string, payload: UpdateProjectPayload): Promise<ProjectDetail> {
    const role = await this.getUserProjectRole(projectId, userId);
    if (role !== 'OWNER' && role !== 'EDITOR') {
      throw new Error('Unauthorized to update project');
    }

    await prisma.project.update({
      where: { id: projectId },
      data: {
        name: payload.name,
        description: payload.description,
        status: payload.status as any
      }
    });

    return this.getProjectById(projectId, userId);
  }

  /**
   * Delete project.
   */
  public async deleteProject(projectId: string, userId: string): Promise<void> {
    const role = await this.getUserProjectRole(projectId, userId);
    if (role !== 'OWNER') {
      throw new Error('Only project owner can delete project');
    }

    await prisma.project.delete({
      where: { id: projectId }
    });
  }

  /**
   * Add a member to a project.
   */
  public async addMember(projectId: string, requesterUserId: string, targetUserId: string, role: ProjectMemberRole): Promise<void> {
    const reqRole = await this.getUserProjectRole(projectId, requesterUserId);
    if (reqRole !== 'OWNER') {
      throw new Error('Only project owner can add members');
    }

    await prisma.projectMember.upsert({
      where: {
        projectId_userId: { projectId, userId: targetUserId }
      },
      update: { role },
      create: { projectId, userId: targetUserId, role }
    });
  }

  /**
   * Remove member from project.
   */
  public async removeMember(projectId: string, requesterUserId: string, memberId: string): Promise<void> {
    const reqRole = await this.getUserProjectRole(projectId, requesterUserId);
    if (reqRole !== 'OWNER') {
      throw new Error('Only project owner can remove members');
    }

    await prisma.projectMember.delete({
      where: { id: memberId }
    });
  }

  /**
   * Link an existing document to a project.
   */
  public async linkDocument(projectId: string, userId: string, documentId: string): Promise<void> {
    const role = await this.getUserProjectRole(projectId, userId);
    if (role !== 'OWNER' && role !== 'EDITOR') {
      throw new Error('Unauthorized to link resources to project');
    }

    // Verify user owns or has access to document
    const doc = await prisma.document.findUnique({ where: { id: documentId } });
    if (!doc || doc.userId !== userId) {
      throw new Error('Document not found or unauthorized');
    }

    await prisma.projectDocument.upsert({
      where: { projectId_documentId: { projectId, documentId } },
      update: {},
      create: { projectId, documentId }
    });
  }

  /**
   * Link an existing roadmap to a project.
   */
  public async linkRoadmap(projectId: string, userId: string, roadmapId: string): Promise<void> {
    const role = await this.getUserProjectRole(projectId, userId);
    if (role !== 'OWNER' && role !== 'EDITOR') {
      throw new Error('Unauthorized to link resources to project');
    }

    await prisma.projectRoadmap.upsert({
      where: { projectId_roadmapId: { projectId, roadmapId } },
      update: {},
      create: { projectId, roadmapId }
    });
  }

  /**
   * Link an existing study session to a project.
   */
  public async linkStudySession(projectId: string, userId: string, studySessionId: string): Promise<void> {
    const role = await this.getUserProjectRole(projectId, userId);
    if (role !== 'OWNER' && role !== 'EDITOR') {
      throw new Error('Unauthorized to link resources to project');
    }

    await prisma.projectStudySession.upsert({
      where: { projectId_studySessionId: { projectId, studySessionId } },
      update: {},
      create: { projectId, studySessionId }
    });
  }

  /**
   * Link an existing research session to a project.
   */
  public async linkResearchSession(projectId: string, userId: string, researchSessionId: string): Promise<void> {
    const role = await this.getUserProjectRole(projectId, userId);
    if (role !== 'OWNER' && role !== 'EDITOR') {
      throw new Error('Unauthorized to link resources to project');
    }

    await prisma.projectResearchSession.upsert({
      where: { projectId_researchSessionId: { projectId, researchSessionId } },
      update: {},
      create: { projectId, researchSessionId }
    });
  }

  /**
   * Link an existing workflow to a project.
   */
  public async linkWorkflow(projectId: string, userId: string, workflowId: string): Promise<void> {
    const role = await this.getUserProjectRole(projectId, userId);
    if (role !== 'OWNER' && role !== 'EDITOR') {
      throw new Error('Unauthorized to link resources to project');
    }

    await prisma.projectWorkflow.upsert({
      where: { projectId_workflowId: { projectId, workflowId } },
      update: {},
      create: { projectId, workflowId }
    });
  }
}

export const projectService = new ProjectService();
