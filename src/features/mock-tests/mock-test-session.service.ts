import { prisma } from '@/lib/prisma';
import { mockTestTimerService } from './mock-test-timer.service';
import { mockTestScoringService } from './mock-test-scoring.service';
import { MCQQuestion, ClientQuestionPayload, AnswerSubmissionItem } from './mock-test.types';
import { MockTestStatus, MockTestParticipantStatus } from '@prisma/client';

export class MockTestSessionService {
  /**
   * Normalizes raw questions (handling both legacy string array options and canonical object array options)
   */
  public normalizeQuestion(raw: any, index = 0): MCQQuestion {
    if (!raw) {
      return {
        id: `q_${index + 1}`,
        questionText: 'Question unavailable',
        type: 'MCQ_SINGLE',
        options: [
          { id: 'A', optionText: 'Option A' },
          { id: 'B', optionText: 'Option B' },
          { id: 'C', optionText: 'Option C' },
          { id: 'D', optionText: 'Option D' }
        ],
        explanation: 'No explanation available.'
      };
    }

    const qText = String(raw.questionText || raw.question || `Question ${index + 1}`);

    const rawOpts = Array.isArray(raw.options) ? raw.options : [];
    const options = rawOpts.map((o: any, idx: number) => {
      const optId = typeof o === 'object' && o?.id ? String(o.id) : String.fromCharCode(65 + idx);
      const optText = typeof o === 'string' ? o : String(o?.optionText || o?.text || `Option ${optId}`);
      const isCorrect = typeof o === 'object' && typeof o?.isCorrect === 'boolean'
        ? o.isCorrect
        : typeof raw.correctOptionIndex === 'number'
        ? raw.correctOptionIndex === idx
        : false;

      return {
        id: optId,
        optionText: optText,
        isCorrect
      };
    });

    const correctOptionId = raw.correctOptionId ||
      (typeof raw.correctOptionIndex === 'number' ? String.fromCharCode(65 + raw.correctOptionIndex) : options.find((o: any) => o.isCorrect)?.id || 'A');

    return {
      id: String(raw.id || `q_${index + 1}`),
      questionText: qText,
      type: raw.type || 'MCQ_SINGLE',
      options,
      correctOptionId,
      explanation: String(raw.explanation || 'Correct based on technical context.'),
      difficulty: raw.difficulty || 'MEDIUM',
      evidenceIds: Array.isArray(raw.evidenceIds) ? raw.evidenceIds : [],
      groundingSource: raw.groundingSource
    };
  }

  /**
   * Formats raw questions for client exposure: STRIPS correct options and explanations!
   */
  public sanitizeQuestionsForClient(questions: MCQQuestion[]): ClientQuestionPayload[] {
    return (questions || []).map((raw, idx) => {
      const q = this.normalizeQuestion(raw, idx);
      return {
        id: q.id,
        questionText: q.questionText,
        type: q.type || 'MCQ_SINGLE',
        options: (q.options || []).map((o) => ({
          id: o.id,
          optionText: o.optionText
        })),
        difficulty: q.difficulty
      };
    });
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
    const normalized = rawQuestions.map((q, idx) => this.normalizeQuestion(q, idx));
    const clientQuestions = this.sanitizeQuestionsForClient(normalized);

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

    const rawQuestions = (mockTest.questions as unknown as MCQQuestion[]) || [];
    const questions = rawQuestions.map((q, idx) => this.normalizeQuestion(q, idx));

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
