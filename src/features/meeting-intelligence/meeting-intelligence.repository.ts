import { prisma } from '@/lib/prisma';
import { MeetingStatus, TaskSuggestionStatus } from '@prisma/client';
import { CreateMeetingInput } from './meeting-intelligence.types';

export class MeetingIntelligenceRepository {
  public async createMeeting(input: CreateMeetingInput) {
    return prisma.meeting.create({
      data: {
        userId: input.userId,
        projectId: input.projectId || null,
        title: input.title,
        description: input.description || null,
        meetingDate: input.meetingDate ? new Date(input.meetingDate) : new Date(),
        sourceProvider: input.sourceProvider || 'MANUAL_PASTE',
        status: 'PENDING',
        participants: input.participants?.length
          ? {
              createMany: {
                data: input.participants.map((p) => ({
                  name: p.name,
                  email: p.email || null,
                  role: p.role || 'ATTENDEE'
                }))
              }
            }
          : undefined
      },
      include: {
        participants: true,
        project: { select: { id: true, name: true } }
      }
    });
  }

  public async getMeetingById(id: string, userId?: string) {
    return prisma.meeting.findFirst({
      where: {
        id,
        ...(userId ? { userId } : {})
      },
      include: {
        participants: true,
        transcript: true,
        analysis: true,
        taskSuggestions: {
          include: { link: true },
          orderBy: { createdAt: 'asc' }
        },
        project: { select: { id: true, name: true } }
      }
    });
  }

  public async listMeetingsByUser(userId: string, projectId?: string) {
    return prisma.meeting.findMany({
      where: {
        userId,
        ...(projectId ? { projectId } : {})
      },
      orderBy: { meetingDate: 'desc' },
      include: {
        participants: true,
        analysis: { select: { summary: true, confidence: true } },
        taskSuggestions: { select: { id: true, status: true, title: true } },
        project: { select: { id: true, name: true } }
      }
    });
  }

  public async updateMeetingStatus(id: string, status: MeetingStatus, errorMessage?: string | null) {
    return prisma.meeting.update({
      where: { id },
      data: {
        status,
        ...(errorMessage !== undefined ? { errorMessage } : {})
      }
    });
  }

  public async updateMeeting(id: string, _userId: string, data: { title?: string; description?: string; projectId?: string | null }) {
    return prisma.meeting.update({
      where: { id },
      data: {
        ...(data.title ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.projectId !== undefined ? { projectId: data.projectId } : {})
      }
    });
  }

  public async deleteMeeting(id: string, userId: string) {
    return prisma.meeting.deleteMany({
      where: { id, userId }
    });
  }

  public async saveTranscript(input: {
    meetingId: string;
    rawContent: string;
    normalizedContent: string;
    wordCount: number;
    language?: string;
  }) {
    return prisma.meetingTranscript.upsert({
      where: { meetingId: input.meetingId },
      create: {
        meetingId: input.meetingId,
        rawContent: input.rawContent,
        normalizedContent: input.normalizedContent,
        wordCount: input.wordCount,
        language: input.language || 'en'
      },
      update: {
        rawContent: input.rawContent,
        normalizedContent: input.normalizedContent,
        wordCount: input.wordCount,
        language: input.language || 'en'
      }
    });
  }

  public async saveAnalysis(input: {
    meetingId: string;
    summary: string;
    discussion?: string[];
    decisions: string[];
    actionItems: any[];
    risks: string[];
    blockers?: string[];
    openQuestions?: string[];
    confidence: number;
  }) {
    return prisma.meetingAnalysis.upsert({
      where: { meetingId: input.meetingId },
      create: {
        meetingId: input.meetingId,
        summary: input.summary,
        discussion: (input.discussion || []) as any,
        decisions: input.decisions as any,
        actionItems: input.actionItems as any,
        risks: input.risks as any,
        blockers: (input.blockers || []) as any,
        openQuestions: (input.openQuestions || []) as any,
        confidence: input.confidence
      },
      update: {
        summary: input.summary,
        discussion: (input.discussion || []) as any,
        decisions: input.decisions as any,
        actionItems: input.actionItems as any,
        risks: input.risks as any,
        blockers: (input.blockers || []) as any,
        openQuestions: (input.openQuestions || []) as any,
        confidence: input.confidence
      }
    });
  }

  public async replaceTaskSuggestions(
    meetingId: string,
    userId: string,
    actionItems: Array<{
      title: string;
      description?: string;
      suggestedAssignee?: string;
      suggestedDueDate?: string | null;
      confidence?: number;
    }>
  ) {
    await prisma.meetingTaskSuggestion.deleteMany({
      where: { meetingId, status: 'PENDING' }
    });

    if (actionItems.length === 0) return [];

    return prisma.meetingTaskSuggestion.createMany({
      data: actionItems.map((item) => ({
        meetingId,
        userId,
        title: item.title,
        description: item.description || null,
        suggestedAssignee: item.suggestedAssignee || null,
        suggestedDueDate: item.suggestedDueDate ? new Date(item.suggestedDueDate) : null,
        confidence: item.confidence ?? 0.9,
        status: 'PENDING'
      }))
    });
  }

  public async getTaskSuggestion(id: string, userId: string) {
    return prisma.meetingTaskSuggestion.findFirst({
      where: { id, userId },
      include: { link: true, meeting: true }
    });
  }

  public async updateTaskSuggestion(
    id: string,
    _userId: string,
    data: {
      title?: string;
      description?: string;
      suggestedAssignee?: string;
      suggestedDueDate?: Date | null;
      status?: TaskSuggestionStatus;
      clickUpTaskId?: string;
      clickUpUrl?: string;
    }
  ) {
    return prisma.meetingTaskSuggestion.update({
      where: { id },
      data: {
        ...(data.title ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.suggestedAssignee !== undefined ? { suggestedAssignee: data.suggestedAssignee } : {}),
        ...(data.suggestedDueDate !== undefined ? { suggestedDueDate: data.suggestedDueDate } : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.clickUpTaskId ? { clickUpTaskId: data.clickUpTaskId } : {}),
        ...(data.clickUpUrl ? { clickUpUrl: data.clickUpUrl } : {})
      }
    });
  }

  public async deleteTaskSuggestion(id: string, userId: string) {
    return prisma.meetingTaskSuggestion.deleteMany({
      where: { id, userId }
    });
  }

  public async createClickUpLink(input: {
    suggestionId: string;
    clickUpTaskId: string;
    clickUpUrl?: string;
    clickUpWorkspaceId?: string;
    clickUpListId?: string;
    status?: string;
    lastError?: string;
  }) {
    return prisma.clickUpTaskLink.upsert({
      where: { suggestionId: input.suggestionId },
      create: {
        suggestionId: input.suggestionId,
        clickUpTaskId: input.clickUpTaskId,
        clickUpUrl: input.clickUpUrl || null,
        clickUpWorkspaceId: input.clickUpWorkspaceId || null,
        clickUpListId: input.clickUpListId || null,
        status: input.status || 'CREATED',
        lastError: input.lastError || null
      },
      update: {
        clickUpTaskId: input.clickUpTaskId,
        clickUpUrl: input.clickUpUrl || null,
        clickUpWorkspaceId: input.clickUpWorkspaceId || null,
        clickUpListId: input.clickUpListId || null,
        status: input.status || 'CREATED',
        lastError: input.lastError || null
      }
    });
  }

  public async getClickUpIntegration(userId: string) {
    return prisma.clickUpIntegration.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' }
    });
  }

  public async saveClickUpIntegration(input: {
    userId: string;
    accessToken: string;
    workspaceId?: string;
    workspaceName?: string;
  }) {
    return prisma.clickUpIntegration.create({
      data: {
        userId: input.userId,
        accessToken: input.accessToken,
        workspaceId: input.workspaceId || null,
        workspaceName: input.workspaceName || null,
        status: 'ACTIVE'
      }
    });
  }

  public async disconnectClickUpIntegration(userId: string) {
    return prisma.clickUpIntegration.updateMany({
      where: { userId },
      data: { status: 'DISCONNECTED' }
    });
  }
}

export const meetingIntelligenceRepository = new MeetingIntelligenceRepository();
