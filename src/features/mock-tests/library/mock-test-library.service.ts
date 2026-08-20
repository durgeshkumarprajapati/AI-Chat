import { prisma } from '@/lib/prisma';
import { MockTestLibraryQueryFilters, PaginatedLibraryResponse, MockTestLibraryCardDTO } from './mock-test-library.types';
import { mockTestLibraryTelemetryService } from './mock-test-library.telemetry';
import { mockTestSessionService } from '../mock-test-session.service';
import { MockTestStatus } from '@prisma/client';

export class MockTestLibraryService {
  /**
   * Returns paginated list of mock tests for the library dashboard
   */
  public async getLibraryTests(userId: string, filters: MockTestLibraryQueryFilters): Promise<PaginatedLibraryResponse> {
    mockTestLibraryTelemetryService.logLibraryViewed(userId, filters.status);

    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    // Apply Tab status filters
    if (filters.status && filters.status !== 'ALL') {
      if (filters.status === 'SCHEDULED') where.status = MockTestStatus.SCHEDULED;
      else if (filters.status === 'LIVE') where.status = MockTestStatus.IN_PROGRESS;
      else if (filters.status === 'COMPLETED') where.status = MockTestStatus.COMPLETED;
      else if (filters.status === 'EXPIRED') where.status = MockTestStatus.EXPIRED;
      else if (filters.status === 'SHARED') {
        where.sharedInMessages = { some: {} };
      }
    }

    // Apply Search Filter across title, description, topic
    if (filters.search && filters.search.trim().length > 0) {
      const q = filters.search.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { topic: { contains: q, mode: 'insensitive' } }
      ];
    }

    if (filters.topic) {
      where.topic = { contains: filters.topic, mode: 'insensitive' };
    }

    const [total, tests] = await Promise.all([
      prisma.scheduledMockTest.count({ where }),
      prisma.scheduledMockTest.findMany({
        where,
        orderBy: { scheduledStartTime: 'desc' },
        skip,
        take: limit,
        include: {
          createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
          participants: {
            where: { userId },
            select: { status: true, score: true, passed: true }
          },
          _count: { select: { participants: true } }
        }
      })
    ]);

    if (filters.search) {
      mockTestLibraryTelemetryService.logSearch(userId, filters.search, total);
    }

    const totalPages = Math.ceil(total / limit);

    const data: MockTestLibraryCardDTO[] = tests.map((t) => {
      const userP = t.participants[0];
      return {
        id: t.id,
        createdById: t.createdById,
        creatorName: t.createdBy?.name || 'Creator',
        creatorAvatarUrl: t.createdBy?.avatarUrl || null,
        title: t.title,
        description: t.description,
        topic: t.topic,
        scheduledStartTime: t.scheduledStartTime,
        durationMinutes: t.durationMinutes,
        totalQuestions: t.totalQuestions,
        status: t.status,
        googleCalendarLink: t.googleCalendarLink,
        participantCount: t._count.participants,
        userParticipantStatus: userP?.status || null,
        userScore: userP?.score || null,
        userPassed: userP?.passed || null,
        createdAt: t.createdAt
      };
    });

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages
      }
    };
  }

  /**
   * Fetches mock test details & participant score overview
   */
  public async getTestDetails(mockTestId: string, userId: string) {
    mockTestLibraryTelemetryService.logMockTestOpened(userId, mockTestId);

    const test = await prisma.scheduledMockTest.findUnique({
      where: { id: mockTestId },
      include: {
        createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
        participants: {
          include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } }
        }
      }
    });

    if (!test) return null;

    const userParticipant = test.participants.find((p) => p.userId === userId) || null;

    return {
      test,
      userParticipant
    };
  }

  /**
   * Question bank inspector with strict active-test answer security
   */
  public async getTestQuestions(mockTestId: string, userId: string) {
    const test = await prisma.scheduledMockTest.findUnique({
      where: { id: mockTestId },
      include: {
        participants: { where: { userId } }
      }
    });

    if (!test) throw new Error('Mock test not found');

    const rawQuestions = (test.questions as unknown as any[]) || [];
    const questions = rawQuestions.map((q, idx) => mockTestSessionService.normalizeQuestion(q, idx));
    mockTestLibraryTelemetryService.logQuestionViewed(userId, mockTestId, questions.length);

    const isCreator = test.createdById === userId;
    const userParticipant = test.participants[0];
    const isCompleted = test.status === MockTestStatus.COMPLETED || test.status === MockTestStatus.EXPIRED || Boolean(userParticipant?.submittedAt);

    // If active/scheduled and user is NOT creator: STRIP correct options and explanations!
    if (!isCreator && !isCompleted) {
      return {
        isSanitized: true,
        questions: mockTestSessionService.sanitizeQuestionsForClient(questions)
      };
    }

    // Creator or completed test: return full questions with correct answers & explanations
    return {
      isSanitized: false,
      questions
    };
  }

  /**
   * Results breakdown for completed tests
   */
  public async getTestResults(mockTestId: string, userId: string) {
    const participant = await prisma.mockTestParticipant.findUnique({
      where: { mockTestId_userId: { mockTestId, userId } },
      include: {
        mockTest: true
      }
    });

    if (!participant) {
      throw new Error('Participant results not found for this user');
    }

    return {
      participant,
      mockTest: participant.mockTest
    };
  }

  /**
   * Delete scheduled mock test — strictly Creator Only!
   */
  public async deleteMockTest(mockTestId: string, userId: string) {
    const test = await prisma.scheduledMockTest.findUnique({
      where: { id: mockTestId }
    });

    if (!test) {
      throw new Error('Mock test not found');
    }

    if (test.createdById !== userId) {
      throw new Error('Forbidden: Only the creator of this mock test can delete it');
    }

    await prisma.scheduledMockTest.delete({
      where: { id: mockTestId }
    });

    return {
      success: true,
      message: 'Mock test deleted successfully'
    };
  }
}

export const mockTestLibraryService = new MockTestLibraryService();
