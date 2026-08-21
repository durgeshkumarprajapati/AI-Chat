import { prisma } from '@/lib/prisma';
import { VoiceTutorSessionMode, VoiceTutorSessionStatus, VoiceTutorRole } from '@prisma/client';

export class VoiceTutorRepository {
  public async createSession(data: {
    userId: string;
    title: string;
    mode: VoiceTutorSessionMode;
    knowledgeBaseId?: string | null;
    documentId?: string | null;
  }) {
    return prisma.voiceTutorSession.create({
      data: {
        userId: data.userId,
        title: data.title,
        mode: data.mode,
        knowledgeBaseId: data.knowledgeBaseId || null,
        documentId: data.documentId || null,
        status: VoiceTutorSessionStatus.ACTIVE
      },
      include: {
        knowledgeBase: { select: { id: true, name: true } },
        document: { select: { id: true, filename: true, originalFilename: true } }
      }
    });
  }

  public async findSessionById(id: string) {
    return prisma.voiceTutorSession.findFirst({
      where: { id },
      include: {
        knowledgeBase: { select: { id: true, name: true } },
        document: { select: { id: true, filename: true, originalFilename: true } },
        messages: {
          orderBy: { createdAt: 'asc' }
        },
        feedback: true
      }
    });
  }

  public async findSessionsByUserId(
    userId: string,
    options?: { limit?: number; offset?: number; status?: VoiceTutorSessionStatus }
  ) {
    const limit = options?.limit || 20;
    const offset = options?.offset || 0;
    const where: any = { userId };
    if (options?.status) {
      where.status = options.status;
    }

    const [sessions, total] = await Promise.all([
      prisma.voiceTutorSession.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          knowledgeBase: { select: { id: true, name: true } },
          document: { select: { id: true, filename: true, originalFilename: true } },
          feedback: { select: { id: true, understandingScore: true, topic: true } }
        }
      }),
      prisma.voiceTutorSession.count({ where })
    ]);

    return { sessions, total };
  }

  public async updateSessionStatus(
    sessionId: string,
    status: VoiceTutorSessionStatus,
    durationSecondsDelta: number = 0
  ) {
    const session = await prisma.voiceTutorSession.findUnique({ where: { id: sessionId } });
    if (!session) return null;

    const newDuration = session.durationSeconds + durationSecondsDelta;
    const endedAt =
      status === VoiceTutorSessionStatus.COMPLETED || status === VoiceTutorSessionStatus.CANCELLED
        ? new Date()
        : session.endedAt;

    return prisma.voiceTutorSession.update({
      where: { id: sessionId },
      data: {
        status,
        durationSeconds: newDuration,
        endedAt
      }
    });
  }

  public async addMessage(data: {
    sessionId: string;
    role: VoiceTutorRole;
    text: string;
    audioUrl?: string | null;
    durationMs?: number | null;
    ragContext?: any;
    graphContext?: any;
    metadata?: any;
  }) {
    const message = await prisma.voiceTutorMessage.create({
      data: {
        sessionId: data.sessionId,
        role: data.role,
        text: data.text,
        audioUrl: data.audioUrl || null,
        durationMs: data.durationMs || null,
        ragContext: data.ragContext || undefined,
        graphContext: data.graphContext || undefined,
        metadata: data.metadata || {}
      }
    });

    await prisma.voiceTutorSession.update({
      where: { id: data.sessionId },
      data: {
        totalMessages: { increment: 1 }
      }
    });

    return message;
  }

  public async createOrUpdateFeedback(data: {
    sessionId: string;
    userId: string;
    topic: string;
    durationMinutes: number;
    conceptsDiscussed: string[];
    strengths: string[];
    weaknesses: string[];
    recommendedTopics: string[];
    understandingScore: number;
    communicationScore: number;
    recommendedMockTestTopic?: string | null;
  }) {
    return prisma.voiceTutorFeedback.upsert({
      where: { sessionId: data.sessionId },
      create: {
        sessionId: data.sessionId,
        userId: data.userId,
        topic: data.topic,
        durationMinutes: data.durationMinutes,
        conceptsDiscussed: data.conceptsDiscussed,
        strengths: data.strengths,
        weaknesses: data.weaknesses,
        recommendedTopics: data.recommendedTopics,
        understandingScore: data.understandingScore,
        communicationScore: data.communicationScore,
        recommendedMockTestTopic: data.recommendedMockTestTopic
      },
      update: {
        topic: data.topic,
        durationMinutes: data.durationMinutes,
        conceptsDiscussed: data.conceptsDiscussed,
        strengths: data.strengths,
        weaknesses: data.weaknesses,
        recommendedTopics: data.recommendedTopics,
        understandingScore: data.understandingScore,
        communicationScore: data.communicationScore,
        recommendedMockTestTopic: data.recommendedMockTestTopic
      }
    });
  }

  public async deleteSession(sessionId: string, userId: string) {
    const session = await prisma.voiceTutorSession.findFirst({
      where: { id: sessionId, userId }
    });
    if (!session) return false;

    await prisma.voiceTutorSession.delete({
      where: { id: sessionId }
    });
    return true;
  }
}

export const voiceTutorRepository = new VoiceTutorRepository();
