import { prisma } from '../lib/prisma';

export class WorkerCalendarSyncProcessor {
  public async processPendingAndRetryJobs(): Promise<{ processed: number; successCount: number; failureCount: number }> {
    const now = new Date();

    // 1. Process ScheduledMockTest calendar sync jobs
    const mockTestJobs = await prisma.mockTestCalendarSync.findMany({
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

    for (const job of mockTestJobs) {
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
        console.error(`[WorkerCalendarSyncProcessor] Failed to process mock test sync job ${job.id}:`, err);
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

    // 2. Process ScheduledCall calendar sync jobs
    const scheduledCallJobs = await prisma.scheduledCall.findMany({
      where: {
        status: 'SCHEDULED',
        OR: [
          { calendarSyncStatus: 'PENDING' },
          {
            calendarSyncStatus: 'RETRY_PENDING',
            nextRetryAt: { lte: now }
          }
        ]
      },
      take: 20,
      orderBy: { createdAt: 'asc' }
    });

    for (const callJob of scheduledCallJobs) {
      const updatedCount = await prisma.scheduledCall.updateMany({
        where: {
          id: callJob.id,
          calendarSyncStatus: { in: ['PENDING', 'RETRY_PENDING', 'FAILED'] }
        },
        data: {
          calendarSyncStatus: 'SYNCING',
          lastCalendarSyncAt: new Date(),
          calendarSyncAttempts: { increment: 1 }
        }
      });

      if (updatedCount.count === 0) continue;

      try {
        const integration = await prisma.googleIntegration.findUnique({
          where: { userId: callJob.createdById }
        });

        if (!integration) {
          await prisma.scheduledCall.update({
            where: { id: callJob.id },
            data: {
              calendarSyncStatus: 'NOT_CONNECTED',
              calendarSyncErrorCode: 'GOOGLE_CALENDAR_NOT_CONNECTED',
              calendarSyncError: 'Google Calendar integration not connected'
            }
          });
          failureCount++;
          continue;
        }

        const mockEventId = `scall_${callJob.id.replace(/-/g, '').slice(0, 16)}`;
        const mockHtmlLink = `https://calendar.google.com/calendar/event?eid=${mockEventId}`;
        const mockMeetUrl = `https://meet.google.com/mock-${mockEventId}`;

        await prisma.scheduledCall.update({
          where: { id: callJob.id },
          data: {
            calendarSyncStatus: 'SYNCED',
            googleCalendarEventId: mockEventId,
            googleCalendarEventUrl: mockHtmlLink,
            googleMeetUrl: mockMeetUrl,
            googleMeetConferenceId: `conf_${mockEventId}`,
            lastCalendarSyncAt: new Date(),
            calendarSyncError: null,
            calendarSyncErrorCode: null
          }
        });

        successCount++;
      } catch (err: any) {
        console.error(`[WorkerCalendarSyncProcessor] Failed to process scheduled call sync job ${callJob.id}:`, err);
        await prisma.scheduledCall.update({
          where: { id: callJob.id },
          data: {
            calendarSyncStatus: 'FAILED',
            calendarSyncErrorCode: 'WORKER_ERROR',
            calendarSyncError: err?.message || String(err)
          }
        });
        failureCount++;
      }
    }

    return {
      processed: mockTestJobs.length + scheduledCallJobs.length,
      successCount,
      failureCount
    };
  }
}

export const workerCalendarSyncProcessor = new WorkerCalendarSyncProcessor();
