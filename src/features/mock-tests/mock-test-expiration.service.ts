import { prisma } from '@/lib/prisma';
import { mockTestScoringService } from './mock-test-scoring.service';
import { MCQQuestion } from './mock-test.types';
import { notificationService } from '@/features/notifications/notification.service';
import { MockTestStatus, MockTestParticipantStatus, NotificationType } from '@prisma/client';

export class MockTestExpirationService {
  /**
   * Idempotent worker job to activate scheduled tests and expire past tests
   */
  public async processTestLifecycles(now: Date = new Date()): Promise<{ activatedCount: number; expiredCount: number }> {
    let activatedCount = 0;
    let expiredCount = 0;

    // 1. Activate SCHEDULED tests whose start time has arrived
    const pendingTests = await prisma.scheduledMockTest.findMany({
      where: {
        status: MockTestStatus.SCHEDULED,
        scheduledStartTime: { lte: now }
      }
    });

    for (const test of pendingTests) {
      const expirationMs = test.scheduledStartTime.getTime() + test.durationMinutes * 60 * 1000;
      if (now.getTime() < expirationMs) {
        await prisma.scheduledMockTest.update({
          where: { id: test.id },
          data: { status: MockTestStatus.IN_PROGRESS }
        });
        activatedCount++;

        // Notify participants
        const participants = await prisma.mockTestParticipant.findMany({
          where: { mockTestId: test.id }
        });

        for (const p of participants) {
          notificationService.createNotification({
            userId: p.userId,
            type: NotificationType.MOCK_TEST_STARTED,
            title: `📝 AI Mock Test Live!`,
            body: `"${test.title}" is now LIVE! Click to take test now.`
          }).catch(() => {});
        }
      }
    }

    // 2. Expire tests whose end time has passed
    const activeTests = await prisma.scheduledMockTest.findMany({
      where: {
        status: { in: [MockTestStatus.SCHEDULED, MockTestStatus.IN_PROGRESS] }
      }
    });

    for (const test of activeTests) {
      const expirationMs = test.scheduledStartTime.getTime() + test.durationMinutes * 60 * 1000;
      if (now.getTime() >= expirationMs) {
        await prisma.scheduledMockTest.update({
          where: { id: test.id },
          data: { status: MockTestStatus.EXPIRED }
        });
        expiredCount++;

        // Auto-submit all non-submitted participants
        const unsubmittedParticipants = await prisma.mockTestParticipant.findMany({
          where: {
            mockTestId: test.id,
            status: { in: [MockTestParticipantStatus.REGISTERED, MockTestParticipantStatus.IN_PROGRESS] }
          }
        });

        const questions = (test.questions as unknown as MCQQuestion[]) || [];

        for (const p of unsubmittedParticipants) {
          const userAnswers = (p.answers as any[]) || [];
          const evalResult = mockTestScoringService.evaluateTest(
            questions,
            userAnswers.map((a: any) => ({
              questionId: a.questionId || questions[a.questionIndex]?.id || '',
              selectedOptionIds: a.selectedOptionIds || (a.selectedOptionIndex !== undefined ? [String(a.selectedOptionIndex)] : [])
            }))
          );

          await prisma.mockTestParticipant.update({
            where: { id: p.id },
            data: {
              status: MockTestParticipantStatus.AUTO_SUBMITTED,
              submittedAt: now,
              score: evalResult.scorePercentage,
              passed: evalResult.passed
            }
          });

          notificationService.createNotification({
            userId: p.userId,
            type: NotificationType.MOCK_TEST_COMPLETED,
            title: `📊 Mock Test Results Ready`,
            body: `Your score for "${test.title}" is ${evalResult.scorePercentage}%.`
          }).catch(() => {});
        }
      }
    }

    return { activatedCount, expiredCount };
  }
}

export const mockTestExpirationService = new MockTestExpirationService();
