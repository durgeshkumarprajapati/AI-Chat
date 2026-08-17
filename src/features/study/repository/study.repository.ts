import { prisma } from '@/lib/prisma';
import {
  StudySessionStatus,
  StudyMode,
  StudyGoal,
  StudyDifficulty,
  StudyLearningStyle
} from '@prisma/client';

export class StudyRepository {
  async createSession(data: {
    userId: string;
    title: string;
    knowledgeBaseId?: string;
    roadmapId?: string;
    goal: StudyGoal;
    difficulty: StudyDifficulty;
    learningStyle: StudyLearningStyle;
    durationMinutes: number;
    externalWebEnabled: boolean;
    sources: Array<{
      documentId?: string;
      knowledgeBaseId?: string;
      roadmapId?: string;
      sourceType: string;
    }>;
  }) {
    return prisma.studySession.create({
      data: {
        userId: data.userId,
        title: data.title,
        knowledgeBaseId: data.knowledgeBaseId || null,
        roadmapId: data.roadmapId || null,
        goal: data.goal,
        difficulty: data.difficulty,
        learningStyle: data.learningStyle,
        durationMinutes: data.durationMinutes,
        externalWebEnabled: data.externalWebEnabled,
        status: StudySessionStatus.ACTIVE,
        sources: {
          create: data.sources.map((s) => ({
            documentId: s.documentId || null,
            knowledgeBaseId: s.knowledgeBaseId || null,
            roadmapId: s.roadmapId || null,
            sourceType: s.sourceType
          }))
        }
      },
      include: {
        sources: {
          include: {
            document: true,
            knowledgeBase: true,
            roadmap: true
          }
        },
        topics: {
          orderBy: { order: 'asc' },
          include: {
            questions: true
          }
        }
      }
    });
  }

  async getSessionById(sessionId: string, userId: string) {
    return prisma.studySession.findFirst({
      where: {
        id: sessionId,
        userId: userId
      },
      include: {
        sources: {
          include: {
            document: true,
            knowledgeBase: true,
            roadmap: true
          }
        },
        topics: {
          orderBy: { order: 'asc' },
          include: {
            questions: true,
            progresses: true
          }
        },
        answers: {
          orderBy: { createdAt: 'desc' },
          include: {
            question: true
          }
        },
        progresses: true
      }
    });
  }

  async getUserSessions(userId: string) {
    return prisma.studySession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        sources: {
          include: {
            document: true,
            knowledgeBase: true,
            roadmap: true
          }
        },
        topics: {
          orderBy: { order: 'asc' }
        }
      }
    });
  }

  async deleteSession(sessionId: string, userId: string) {
    const session = await prisma.studySession.findFirst({
      where: { id: sessionId, userId }
    });
    if (!session) return false;

    await prisma.studySession.delete({
      where: { id: sessionId }
    });
    return true;
  }

  async updateSessionStatus(sessionId: string, status: StudySessionStatus) {
    return prisma.studySession.update({
      where: { id: sessionId },
      data: {
        status,
        completedAt: status === StudySessionStatus.COMPLETED ? new Date() : null
      }
    });
  }

  async updateSessionMode(sessionId: string, mode: StudyMode) {
    return prisma.studySession.update({
      where: { id: sessionId },
      data: { currentMode: mode }
    });
  }

  async createTopics(sessionId: string, topics: Array<{ title: string; description: string; order: number }>) {
    const created = [];
    for (const t of topics) {
      const topic = await prisma.studyTopic.create({
        data: {
          sessionId,
          title: t.title,
          description: t.description,
          order: t.order,
          status: t.order === 1 ? 'IN_PROGRESS' : 'PENDING'
        },
        include: {
          questions: true
        }
      });
      created.push(topic);
    }
    return created;
  }

  async createQuestion(data: {
    topicId: string;
    questionType: any;
    question: string;
    options?: any;
    expectedAnswer: string;
    explanation: string;
    difficulty: StudyDifficulty;
    sourceFingerprint?: string;
  }) {
    return prisma.studyQuestion.create({
      data: {
        topicId: data.topicId,
        questionType: data.questionType,
        question: data.question,
        options: data.options || [],
        expectedAnswer: data.expectedAnswer,
        explanation: data.explanation,
        difficulty: data.difficulty,
        sourceFingerprint: data.sourceFingerprint || null
      }
    });
  }

  async saveAnswer(data: {
    questionId: string;
    sessionId: string;
    userId: string;
    answer: string;
    isCorrect: boolean;
    score: number;
    feedback: string;
    hintsUsed: number;
  }) {
    const answer = await prisma.studyAnswer.create({
      data: {
        questionId: data.questionId,
        sessionId: data.sessionId,
        userId: data.userId,
        answer: data.answer,
        isCorrect: data.isCorrect,
        score: data.score,
        feedback: data.feedback,
        hintsUsed: data.hintsUsed
      }
    });

    await prisma.studyAttempt.create({
      data: {
        sessionId: data.sessionId,
        questionId: data.questionId,
        userId: data.userId,
        answer: data.answer,
        score: data.score,
        feedback: data.feedback,
        latencyMs: 100
      }
    });

    return answer;
  }

  async updateTopicMastery(topicId: string, masteryScore: number) {
    return prisma.studyTopic.update({
      where: { id: topicId },
      data: {
        masteryScore,
        status: masteryScore >= 80 ? 'COMPLETED' : 'IN_PROGRESS'
      }
    });
  }

  async upsertProgress(data: {
    sessionId: string;
    topicId: string;
    attemptedQuestions: number;
    correctAnswers: number;
    masteryScore: number;
    nextReviewAt?: Date;
  }) {
    return prisma.studyProgress.upsert({
      where: {
        sessionId_topicId: {
          sessionId: data.sessionId,
          topicId: data.topicId
        }
      },
      update: {
        attemptedQuestions: { increment: 1 },
        correctAnswers: data.correctAnswers,
        masteryScore: data.masteryScore,
        lastReviewedAt: new Date(),
        nextReviewAt: data.nextReviewAt || null
      },
      create: {
        sessionId: data.sessionId,
        topicId: data.topicId,
        attemptedQuestions: 1,
        correctAnswers: data.correctAnswers,
        masteryScore: data.masteryScore,
        lastReviewedAt: new Date(),
        nextReviewAt: data.nextReviewAt || null
      }
    });
  }

  async updateSessionProgress(sessionId: string, progressPercent: number) {
    return prisma.studySession.update({
      where: { id: sessionId },
      data: { progressPercent }
    });
  }
}

export const studyRepository = new StudyRepository();
