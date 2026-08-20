import { prisma } from '@/lib/prisma';
import { CalendarSyncStatus } from '@prisma/client';

export class GoogleCalendarRepository {
  /**
   * Find sync record by mockTestId & userId
   */
  public async findSyncRecord(mockTestId: string, userId: string) {
    return prisma.mockTestCalendarSync.findUnique({
      where: { mockTestId_userId: { mockTestId, userId } }
    });
  }

  /**
   * Find all sync records for a mock test
   */
  public async findSyncRecordsForMockTest(mockTestId: string) {
    return prisma.mockTestCalendarSync.findMany({
      where: { mockTestId }
    });
  }

  /**
   * Create or reset pending sync record
   */
  public async upsertPendingRecord(mockTestId: string, userId: string) {
    return prisma.mockTestCalendarSync.upsert({
      where: { mockTestId_userId: { mockTestId, userId } },
      create: {
        mockTestId,
        userId,
        provider: 'google',
        calendarId: 'primary',
        status: CalendarSyncStatus.PENDING
      },
      update: {
        status: CalendarSyncStatus.PENDING,
        lastErrorMessage: null,
        lastErrorCode: null
      }
    });
  }

  /**
   * Claim job atomically by transitioning status to SYNCING
   */
  public async claimJobForSync(syncId: string): Promise<boolean> {
    const updated = await prisma.mockTestCalendarSync.updateMany({
      where: {
        id: syncId,
        status: { in: [CalendarSyncStatus.PENDING, CalendarSyncStatus.RETRY_PENDING, CalendarSyncStatus.FAILED] }
      },
      data: {
        status: CalendarSyncStatus.SYNCING,
        lastAttemptAt: new Date(),
        attemptCount: { increment: 1 }
      }
    });

    return updated.count > 0;
  }

  /**
   * Mark record as SYNCED
   */
  public async markSynced(syncId: string, mockTestId: string, eventId: string, eventHtmlLink: string) {
    const now = new Date();
    await prisma.$transaction([
      prisma.mockTestCalendarSync.update({
        where: { id: syncId },
        data: {
          status: CalendarSyncStatus.SYNCED,
          eventId,
          eventHtmlLink,
          syncedAt: now,
          lastErrorCode: null,
          lastErrorMessage: null,
          nextRetryAt: null
        }
      }),
      prisma.scheduledMockTest.update({
        where: { id: mockTestId },
        data: {
          googleCalendarEventId: eventId,
          googleCalendarEventUrl: eventHtmlLink,
          googleCalendarLink: eventHtmlLink,
          googleCalendarSyncStatus: CalendarSyncStatus.SYNCED,
          googleCalendarSyncError: null,
          googleCalendarSyncedAt: now
        }
      })
    ]);
  }

  /**
   * Mark record as RETRY_PENDING or FAILED
   */
  public async markFailed(
    syncId: string,
    mockTestId: string,
    errorCode: string,
    errorMessage: string,
    isTransient: boolean,
    nextRetryAt: Date | null
  ) {
    const nextStatus = isTransient && nextRetryAt ? CalendarSyncStatus.RETRY_PENDING : CalendarSyncStatus.FAILED;

    await prisma.$transaction([
      prisma.mockTestCalendarSync.update({
        where: { id: syncId },
        data: {
          status: nextStatus,
          lastErrorCode: errorCode,
          lastErrorMessage: errorMessage,
          nextRetryAt
        }
      }),
      prisma.scheduledMockTest.update({
        where: { id: mockTestId },
        data: {
          googleCalendarSyncStatus: nextStatus,
          googleCalendarSyncError: errorMessage
        }
      })
    ]);
  }

  /**
   * Mark record as NOT_CONNECTED
   */
  public async markNotConnected(syncId: string, mockTestId: string, errorMessage: string) {
    await prisma.$transaction([
      prisma.mockTestCalendarSync.update({
        where: { id: syncId },
        data: {
          status: CalendarSyncStatus.NOT_CONNECTED,
          lastErrorCode: 'GOOGLE_CALENDAR_NOT_CONNECTED',
          lastErrorMessage: errorMessage,
          nextRetryAt: null
        }
      }),
      prisma.scheduledMockTest.update({
        where: { id: mockTestId },
        data: {
          googleCalendarSyncStatus: CalendarSyncStatus.NOT_CONNECTED,
          googleCalendarSyncError: errorMessage
        }
      })
    ]);
  }

  /**
   * Mark record as REAUTH_REQUIRED
   */
  public async markReauthRequired(syncId: string, mockTestId: string, errorMessage: string) {
    await prisma.$transaction([
      prisma.mockTestCalendarSync.update({
        where: { id: syncId },
        data: {
          status: CalendarSyncStatus.REAUTH_REQUIRED,
          lastErrorCode: 'GOOGLE_REAUTH_REQUIRED',
          lastErrorMessage: errorMessage,
          nextRetryAt: null
        }
      }),
      prisma.scheduledMockTest.update({
        where: { id: mockTestId },
        data: {
          googleCalendarSyncStatus: CalendarSyncStatus.REAUTH_REQUIRED,
          googleCalendarSyncError: errorMessage
        }
      })
    ]);
  }

  /**
   * Mark sync records for mock test as CANCELLED
   */
  public async markCancelled(mockTestId: string) {
    await prisma.$transaction([
      prisma.mockTestCalendarSync.updateMany({
        where: { mockTestId },
        data: {
          status: CalendarSyncStatus.CANCELLED,
          nextRetryAt: null
        }
      }),
      prisma.scheduledMockTest.update({
        where: { id: mockTestId },
        data: {
          googleCalendarSyncStatus: CalendarSyncStatus.CANCELLED
        }
      })
    ]);
  }

  /**
   * Find PENDING or RETRY_PENDING records eligible for processing by worker
   */
  public async findEligibleRetryJobs(limit = 20) {
    const now = new Date();
    return prisma.mockTestCalendarSync.findMany({
      where: {
        OR: [
          { status: CalendarSyncStatus.PENDING },
          {
            status: CalendarSyncStatus.RETRY_PENDING,
            nextRetryAt: { lte: now }
          }
        ]
      },
      include: {
        mockTest: {
          include: {
            participants: {
              include: {
                user: { select: { email: true } }
              }
            }
          }
        }
      },
      take: limit,
      orderBy: { createdAt: 'asc' }
    });
  }
}

export const googleCalendarRepository = new GoogleCalendarRepository();
