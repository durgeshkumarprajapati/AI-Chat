import { prisma } from '@/lib/prisma';
import { mockTestGeneratorService } from './mock-test-generator.service';
import { mockTestTimerService } from './mock-test-timer.service';
import { mockTestSessionService } from './mock-test-session.service';
import { mockTestShareService } from './mock-test-share.service';
import { mockTestExpirationService } from './mock-test-expiration.service';
import { MockTestConfig } from './mock-test.types';
import { MockTestStatus } from '@prisma/client';

export class MockTestService {
  public async createAndScheduleTest(userId: string, config: MockTestConfig) {
    const scheduledStart = new Date(config.scheduledStartAt);
    const durationMinutes = config.durationMinutes || 30;

    if (scheduledStart.getTime() < Date.now() - 60000) {
      throw new Error('Scheduled start time must be in the future');
    }

    const questions = await mockTestGeneratorService.generateQuestions({
      topic: config.topic || config.title,
      questionCount: config.questionCount || 10,
      difficulty: config.difficulty || 'INTERMEDIATE'
    });

    const mockTest = await prisma.scheduledMockTest.create({
      data: {
        createdById: userId,
        title: config.title,
        description: config.description || null,
        topic: config.topic || null,
        scheduledStartTime: scheduledStart,
        durationMinutes,
        totalQuestions: questions.length,
        passingScore: 70.0,
        status: MockTestStatus.SCHEDULED,
        questions: questions as any
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } }
      }
    });

    return mockTest;
  }

  public async getTestDetails(mockTestId: string, userId?: string) {
    const nowServer = new Date();
    const mockTest = await prisma.scheduledMockTest.findUnique({
      where: { id: mockTestId },
      include: {
        createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
        participants: {
          include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } }
        }
      }
    });

    if (!mockTest) throw new Error('Mock test not found');

    const timer = mockTestTimerService.calculateServerTimer({
      scheduledStartAt: mockTest.scheduledStartTime,
      durationMinutes: mockTest.durationMinutes,
      nowServer
    });

    const userParticipant = userId
      ? mockTest.participants.find((p) => p.userId === userId) || null
      : null;

    return {
      mockTest,
      timer,
      userParticipant
    };
  }

  public async startTestSession(mockTestId: string, userId: string) {
    return mockTestSessionService.startSession(mockTestId, userId);
  }

  public async submitAnswers(mockTestId: string, userId: string, submissions: any[]) {
    return mockTestSessionService.submitAnswers(mockTestId, userId, submissions);
  }

  public async shareTestToChannel(mockTestId: string, channelId: string, senderId: string) {
    return mockTestShareService.shareTestToChannel(mockTestId, channelId, senderId);
  }

  public async processExpirationWorker() {
    return mockTestExpirationService.processTestLifecycles();
  }
}

export const mockTestService = new MockTestService();
