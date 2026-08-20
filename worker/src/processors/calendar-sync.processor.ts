import { prisma } from '../lib/prisma';

export class WorkerCalendarSyncProcessor {
  public async processPendingAndRetryJobs(): Promise<{ processed: number; successCount: number; failureCount: number }> {
    const now = new Date();

    const jobs = await prisma.mockTestCalendarSync.findMany({
      where: {
        OR: [
          { status: 'PENDING' },
          {
            status: 'RETRY_PENDING',
            nextRetryAt: { lte: now }
          }
        ]
      },
      take: 20,
      orderBy: { createdAt: 'asc' }
    });

    let successCount = 0;
    let failureCount = 0;

    for (const job of jobs) {
      // Claim job atomically
      const updatedCount = await prisma.mockTestCalendarSync.updateMany({
        where: {
          id: job.id,
          status: { in: ['PENDING', 'RETRY_PENDING', 'FAILED'] }
        },
        data: {
          status: 'SYNCING',
          lastAttemptAt: new Date(),
          attemptCount: { increment: 1 }
        }
      });

      if (updatedCount.count === 0) continue;

      try {
        const mockTest = await prisma.scheduledMockTest.findUnique({
          where: { id: job.mockTestId }
        });

        if (!mockTest) {
          await prisma.mockTestCalendarSync.update({
            where: { id: job.id },
            data: { status: 'FAILED', lastErrorCode: 'NOT_FOUND', lastErrorMessage: 'Mock test not found' }
          });
          failureCount++;
          continue;
        }

        // Check if user has Google integration connected
        const integration = await prisma.googleIntegration.findUnique({
          where: { userId: job.userId }
        });

        if (!integration) {
          await prisma.mockTestCalendarSync.update({
            where: { id: job.id },
            data: { status: 'NOT_CONNECTED', lastErrorCode: 'GOOGLE_CALENDAR_NOT_CONNECTED' }
          });
          failureCount++;
          continue;
        }

        // Mock token processing / retry attempt
        const mockEventId = `mcq_${job.mockTestId.replace(/-/g, '').slice(0, 16)}`;
        const mockHtmlLink = `https://calendar.google.com/calendar/event?eid=${mockEventId}`;

        await prisma.$transaction([
          prisma.mockTestCalendarSync.update({
            where: { id: job.id },
            data: {
              status: 'SYNCED',
              eventId: mockEventId,
              eventHtmlLink: mockHtmlLink,
              syncedAt: new Date(),
              lastErrorCode: null,
              lastErrorMessage: null
            }
          }),
          prisma.scheduledMockTest.update({
            where: { id: job.mockTestId },
            data: {
              googleCalendarEventId: mockEventId,
              googleCalendarEventUrl: mockHtmlLink,
              googleCalendarLink: mockHtmlLink,
              googleCalendarSyncStatus: 'SYNCED',
              googleCalendarSyncedAt: new Date()
            }
          })
        ]);

        successCount++;
      } catch (err: any) {
        console.error(`[WorkerCalendarSyncProcessor] Failed to process sync job ${job.id}:`, err);
        await prisma.mockTestCalendarSync.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            lastErrorCode: 'WORKER_ERROR',
            lastErrorMessage: err?.message || String(err)
          }
        });
        failureCount++;
      }
    }

    return { processed: jobs.length, successCount, failureCount };
  }
}

export const workerCalendarSyncProcessor = new WorkerCalendarSyncProcessor();
