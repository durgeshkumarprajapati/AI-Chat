import { prisma } from '@/lib/prisma';
import { mockTestTimerService } from './mock-test-timer.service';
import { mockTestScoringService } from './mock-test-scoring.service';
import { MCQQuestion, ClientQuestionPayload, AnswerSubmissionItem } from './mock-test.types';
import { MockTestStatus, MockTestParticipantStatus } from '@prisma/client';

export class MockTestSessionService {
  /**
   * Formats raw questions for client exposure: STRIPS correct options and explanations!
   */
  public sanitizeQuestionsForClient(questions: MCQQuestion[]): ClientQuestionPayload[] {
    return questions.map((q) => ({
      id: q.id,
      questionText: q.questionText,
      type: q.type || 'MCQ_SINGLE',
      options: (q.options || []).map((o) => ({
        id: o.id,
        optionText: o.optionText
      }))
    }));
  }

  /**
   * Start or join a test session with server-authoritative time check
   */
  public async startSession(mockTestId: string, userId: string) {
    const mockTest = await prisma.scheduledMockTest.findUnique({
      where: { id: mockTestId }
    });
    if (!mockTest) throw new Error('Mock test not found');

    const timer = mockTestTimerService.calculateServerTimer({
      scheduledStartAt: mockTest.scheduledStartTime,
      durationMinutes: mockTest.durationMinutes,
      allowLateJoin: true
    });

    if (timer.isExpired || mockTest.status === MockTestStatus.EXPIRED) {
      throw new Error('This mock test has expired');
    }
    if (!timer.isStarted) {
      throw new Error(`Mock test starts at ${mockTest.scheduledStartTime.toISOString()}`);
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
          joinedAt: timer.nowServer,
          startedAt: timer.nowServer
        }
      });
    } else if (participant.status === MockTestParticipantStatus.REGISTERED) {
      participant = await prisma.mockTestParticipant.update({
        where: { id: participant.id },
        data: {
          status: MockTestParticipantStatus.IN_PROGRESS,
          joinedAt: timer.nowServer,
          startedAt: timer.nowServer
        }
      });
    }

    if (mockTest.status === MockTestStatus.SCHEDULED) {
      await prisma.scheduledMockTest.update({
        where: { id: mockTestId },
        data: { status: MockTestStatus.IN_PROGRESS }
      });
    }

    const rawQuestions = (mockTest.questions as unknown as MCQQuestion[]) || [];
    const clientQuestions = this.sanitizeQuestionsForClient(rawQuestions);

    return {
      success: true,
      participant,
      questions: clientQuestions,
      timer
    };
  }

  /**
   * Submit answers for server-authoritative evaluation
   */
  public async submitAnswers(mockTestId: string, userId: string, userSubmissions: AnswerSubmissionItem[]) {
    const mockTest = await prisma.scheduledMockTest.findUnique({
      where: { id: mockTestId }
    });
    if (!mockTest) throw new Error('Mock test not found');

    const timer = mockTestTimerService.calculateServerTimer({
      scheduledStartAt: mockTest.scheduledStartTime,
      durationMinutes: mockTest.durationMinutes
    });

    const scheduledEnd = new Date(mockTest.scheduledStartTime.getTime() + mockTest.durationMinutes * 60 * 1000);
    const isSubmissionValid = mockTestTimerService.isSubmissionValid(scheduledEnd);

    const questions = (mockTest.questions as unknown as MCQQuestion[]) || [];
    const scoreResult = mockTestScoringService.evaluateTest(questions, userSubmissions, mockTest.passingScore);

    const statusEnum = isSubmissionValid ? MockTestParticipantStatus.SUBMITTED : MockTestParticipantStatus.AUTO_SUBMITTED;

    const participant = await prisma.mockTestParticipant.upsert({
      where: { mockTestId_userId: { mockTestId, userId } },
      create: {
        mockTestId,
        userId,
        status: statusEnum,
        startedAt: timer.nowServer,
        submittedAt: timer.nowServer,
        score: scoreResult.scorePercentage,
        passed: scoreResult.passed,
        answers: userSubmissions as any
      },
      update: {
        status: statusEnum,
        submittedAt: timer.nowServer,
        score: scoreResult.scorePercentage,
        passed: scoreResult.passed,
        answers: userSubmissions as any
      }
    });

    return {
      success: true,
      participant,
      scoreResult,
      timer
    };
  }
}

export const mockTestSessionService = new MockTestSessionService();
