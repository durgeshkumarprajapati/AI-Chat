import { prisma } from '@/lib/prisma';
import { mockTestGeneratorService } from '@/features/mock-tests/mock-test-generator.service';
import { MCQQuestion } from '@/features/mock-tests/mock-test.types';
import { googleCalendarService } from '@/features/calendar/google-calendar.service';
import { calendarSyncService } from '@/features/google-calendar/google-calendar.service';
import { MockTestStatus, MockTestParticipantStatus } from '@prisma/client';

export interface ScheduleMockTestInput {
  title: string;
  description?: string;
  topic?: string;
  documentId?: string;
  knowledgeBaseId?: string;
  scheduledStartTime: string | Date;
  durationMinutes?: number;
  totalQuestions?: number;
  passingScore?: number;
}

export interface SubmitMockTestAnswersInput {
  answers: Array<{
    questionIndex: number;
    selectedOptionIndex: number;
    timeSpentMs?: number;
  }>;
}

export class ScheduledMockTestService {
  /**
   * Schedule a new AI Mock Test & generate Google Calendar sync links
   */
  public async scheduleMockTest(userId: string, input: ScheduleMockTestInput) {
    const scheduledStart = new Date(input.scheduledStartTime);
    const durationMinutes = input.durationMinutes || 30;
    const totalQuestions = input.totalQuestions || 10;
    const passingScore = input.passingScore || 70.0;

    if (scheduledStart.getTime() < Date.now() - 60000) {
      throw new Error('Scheduled start time must be in the future');
    }

    // Generate AI questions via Gemini canonical generator
    const questions = await mockTestGeneratorService.generateQuestions({
      topic: input.topic || input.title,
      documentId: input.documentId,
      knowledgeBaseId: input.knowledgeBaseId,
      questionCount: totalQuestions
    });

    // Create Google Calendar Details & Template URL
    const scheduledEnd = new Date(scheduledStart.getTime() + durationMinutes * 60 * 1000);
    const fallbackTemplateUrl = googleCalendarService.generateGoogleCalendarUrl({
      title: `📝 AI Mock Test: ${input.title}`,
      description: input.description || `AI Generated Mock Test on ${input.topic || input.title}`,
      startTime: scheduledStart,
      endTime: scheduledEnd
    });

    // 1. Create Scheduled Mock Test record
    const mockTest = await prisma.scheduledMockTest.create({
      data: {
        createdById: userId,
        title: input.title,
        description: input.description || null,
        topic: input.topic || null,
        documentId: input.documentId || null,
        knowledgeBaseId: input.knowledgeBaseId || null,
        scheduledStartTime: scheduledStart,
        durationMinutes,
        totalQuestions: questions.length,
        passingScore,
        status: MockTestStatus.SCHEDULED,
        googleCalendarLink: fallbackTemplateUrl,
        googleCalendarSyncStatus: 'PENDING',
        questions: questions as any
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } }
      }
    });

    // 2. Register creator as participant
    await prisma.mockTestParticipant.create({
      data: {
        mockTestId: mockTest.id,
        userId,
        status: MockTestParticipantStatus.REGISTERED
      }
    });

    // 3. Attempt Google Calendar API synchronization via CalendarSyncService
    try {
      await calendarSyncService.synchronizeMockTest(mockTest.id, userId);
      const updated = await prisma.scheduledMockTest.findUnique({
        where: { id: mockTest.id },
        include: {
          createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } }
        }
      });
      return updated || mockTest;
    } catch (calendarErr: any) {
      console.error('[ScheduledMockTest] Calendar sync exception:', calendarErr?.message || calendarErr);
      return mockTest;
    }
  }

  /**
   * Fetch test details with server-authoritative time & expiration check
   */
  public async getMockTestDetails(mockTestId: string, userId?: string) {
    const nowServer = new Date();
    let mockTest = await prisma.scheduledMockTest.findUnique({
      where: { id: mockTestId },
      include: {
        createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
        participants: {
          include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } }
        }
      }
    });

    if (!mockTest) throw new Error('Mock test not found');

    // Server-authoritative expiration check
    const startMs = mockTest.scheduledStartTime.getTime();
    const expirationMs = startMs + mockTest.durationMinutes * 60 * 1000;

    if (mockTest.status !== MockTestStatus.EXPIRED && mockTest.status !== MockTestStatus.COMPLETED && nowServer.getTime() > expirationMs) {
      mockTest = await prisma.scheduledMockTest.update({
        where: { id: mockTestId },
        data: { status: MockTestStatus.EXPIRED },
        include: {
          createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
          participants: {
            include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } }
          }
        }
      });
    }

    const isStarted = nowServer.getTime() >= startMs;
    const isExpired = nowServer.getTime() > expirationMs;

    const userParticipant = userId
      ? mockTest.participants.find((p) => p.userId === userId) || null
      : null;

    return {
      mockTest,
      nowServer: nowServer.toISOString(),
      serverTimestampMs: nowServer.getTime(),
      scheduledStartTimeMs: startMs,
      expirationTimeMs: expirationMs,
      isStarted,
      isExpired,
      userParticipant
    };
  }

  /**
   * Server-authoritative Quiz Start
   */
  public async startMockTestSession(mockTestId: string, userId: string) {
    const details = await this.getMockTestDetails(mockTestId, userId);
    const { mockTest, isStarted, isExpired } = details;

    if (isExpired || mockTest.status === MockTestStatus.EXPIRED) {
      throw new Error('This mock test has expired');
    }
    if (!isStarted) {
      throw new Error(`Mock test has not started yet. Starts at ${mockTest.scheduledStartTime.toISOString()}`);
    }

    let participant = await prisma.mockTestParticipant.findUnique({
      where: { mockTestId_userId: { mockTestId, userId } }
    });

    if (!participant) {
      participant = await prisma.mockTestParticipant.create({
        data: {
          mockTestId,
          userId,
          status: MockTestParticipantStatus.IN_PROGRESS,
          joinedAt: new Date(),
          startedAt: new Date()
        }
      });
    } else if (participant.status === MockTestParticipantStatus.REGISTERED) {
      participant = await prisma.mockTestParticipant.update({
        where: { id: participant.id },
        data: {
          status: MockTestParticipantStatus.IN_PROGRESS,
          joinedAt: new Date(),
          startedAt: new Date()
        }
      });
    }

    // Update test status to IN_PROGRESS if first participant
    if (mockTest.status === MockTestStatus.SCHEDULED) {
      await prisma.scheduledMockTest.update({
        where: { id: mockTestId },
        data: { status: MockTestStatus.IN_PROGRESS }
      });
    }

    return {
      success: true,
      participant,
      questions: mockTest.questions,
      durationMinutes: mockTest.durationMinutes,
      expirationTimeMs: details.expirationTimeMs,
      nowServer: details.nowServer
    };
  }

  /**
   * Submit quiz answers & calculate server-authoritative score
   */
  public async submitMockTestAnswers(mockTestId: string, userId: string, input: SubmitMockTestAnswersInput) {
    const details = await this.getMockTestDetails(mockTestId, userId);
    const { mockTest } = details;

    const questions = mockTest.questions as unknown as MCQQuestion[];
    if (!questions || questions.length === 0) {
      throw new Error('Invalid test questions');
    }

    let correctCount = 0;
    const evaluatedAnswers = input.answers.map((ans) => {
      const q = questions[ans.questionIndex];
      const isCorrect = q
        ? (typeof (q as any).correctOptionIndex === 'number'
            ? (q as any).correctOptionIndex === ans.selectedOptionIndex
            : q.options[ans.selectedOptionIndex]?.id === q.correctOptionId || Boolean(q.options[ans.selectedOptionIndex]?.isCorrect))
        : false;
      if (isCorrect) correctCount++;
      return {
        questionIndex: ans.questionIndex,
        selectedOptionIndex: ans.selectedOptionIndex,
        isCorrect,
        timeSpentMs: ans.timeSpentMs || 0
      };
    });

    const scorePct = Math.round((correctCount / questions.length) * 1000) / 10;
    const passed = scorePct >= mockTest.passingScore;

    const participant = await prisma.mockTestParticipant.upsert({
      where: { mockTestId_userId: { mockTestId, userId } },
      create: {
        mockTestId,
        userId,
        status: MockTestParticipantStatus.SUBMITTED,
        startedAt: new Date(),
        submittedAt: new Date(),
        score: scorePct,
        passed,
        answers: evaluatedAnswers as any
      },
      update: {
        status: MockTestParticipantStatus.SUBMITTED,
        submittedAt: new Date(),
        score: scorePct,
        passed,
        answers: evaluatedAnswers as any
      }
    });

    return {
      success: true,
      score: scorePct,
      passed,
      correctCount,
      totalQuestions: questions.length,
      passingScore: mockTest.passingScore,
      participant,
      evaluatedAnswers
    };
  }

  /**
   * Share Scheduled Mock Test into a Collaboration Channel
   */
  public async shareMockTestToChannel(mockTestId: string, channelId: string) {
    const mockTest = await prisma.scheduledMockTest.findUnique({
      where: { id: mockTestId }
    });
    if (!mockTest) throw new Error('Mock test not found');

    await fetch(`http://localhost:3000/api/collaboration/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `📝 Scheduled AI Mock Test: "${mockTest.title}"`,
        sharedMockTestId: mockTest.id
      })
    }).catch(() => null);

    return { success: true, mockTest };
  }
}

export const scheduledMockTestService = new ScheduledMockTestService();
