import { prisma } from '@/lib/prisma';
import { ScheduledCallStatus, ScheduledCallType, CalendarSyncStatus } from '@prisma/client';

export class ScheduledCallRepository {
  public async findById(id: string) {
    return prisma.scheduledCall.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
        channel: { select: { id: true, name: true, type: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } }
          }
        }
      }
    });
  }

  public async findActiveByChannelId(channelId: string) {
    return prisma.scheduledCall.findMany({
      where: {
        channelId,
        status: { in: [ScheduledCallStatus.SCHEDULED, ScheduledCallStatus.LIVE] }
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } }
          }
        }
      },
      orderBy: { scheduledStartAt: 'asc' }
    });
  }

  public async findPendingOrRetrySyncs(take: number = 20) {
    const now = new Date();
    return prisma.scheduledCall.findMany({
      where: {
        OR: [
          { calendarSyncStatus: CalendarSyncStatus.PENDING },
          {
            calendarSyncStatus: CalendarSyncStatus.RETRY_PENDING,
            nextRetryAt: { lte: now }
          }
        ]
      },
      take,
      orderBy: { createdAt: 'asc' },
      include: {
        participants: {
          include: {
            user: { select: { id: true, email: true } }
          }
        }
      }
    });
  }

  public async claimJobForSync(id: string): Promise<boolean> {
    const res = await prisma.scheduledCall.updateMany({
      where: {
        id,
        calendarSyncStatus: { in: [CalendarSyncStatus.PENDING, CalendarSyncStatus.RETRY_PENDING, CalendarSyncStatus.FAILED] }
      },
      data: {
        calendarSyncStatus: CalendarSyncStatus.SYNCING,
        lastCalendarSyncAt: new Date(),
        calendarSyncAttempts: { increment: 1 }
      }
    });
    return res.count > 0;
  }

  public async markSynced(id: string, eventId: string, eventUrl: string, meetUrl?: string, conferenceId?: string) {
    return prisma.scheduledCall.update({
      where: { id },
      data: {
        calendarSyncStatus: CalendarSyncStatus.SYNCED,
        googleCalendarEventId: eventId,
        googleCalendarEventUrl: eventUrl,
        googleMeetUrl: meetUrl || null,
        googleMeetConferenceId: conferenceId || null,
        calendarSyncError: null,
        calendarSyncErrorCode: null,
        lastCalendarSyncAt: new Date()
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
        channel: { select: { id: true, name: true, type: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } }
          }
        }
      }
    });
  }

  public async markSyncFailed(
    id: string,
    errorCode: string,
    errorMsg: string,
    isTransient: boolean,
    nextRetryAt: Date | null
  ) {
    return prisma.scheduledCall.update({
      where: { id },
      data: {
        calendarSyncStatus: isTransient ? CalendarSyncStatus.RETRY_PENDING : CalendarSyncStatus.FAILED,
        calendarSyncErrorCode: errorCode,
        calendarSyncError: errorMsg,
        nextRetryAt,
        lastCalendarSyncAt: new Date()
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
        channel: { select: { id: true, name: true, type: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } }
          }
        }
      }
    });
  }

  public async markNotConnected(id: string, errorMsg?: string) {
    return prisma.scheduledCall.update({
      where: { id },
      data: {
        calendarSyncStatus: CalendarSyncStatus.NOT_CONNECTED,
        calendarSyncErrorCode: 'GOOGLE_CALENDAR_NOT_CONNECTED',
        calendarSyncError: errorMsg || 'Google Calendar not connected',
        lastCalendarSyncAt: new Date()
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
        channel: { select: { id: true, name: true, type: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } }
          }
        }
      }
    });
  }

  public async markReauthRequired(id: string, errorMsg?: string) {
    return prisma.scheduledCall.update({
      where: { id },
      data: {
        calendarSyncStatus: CalendarSyncStatus.REAUTH_REQUIRED,
        calendarSyncErrorCode: 'GOOGLE_REAUTH_REQUIRED',
        calendarSyncError: errorMsg || 'Google Calendar re-authorization required',
        lastCalendarSyncAt: new Date()
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
        channel: { select: { id: true, name: true, type: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } }
          }
        }
      }
    });
  }

  public async createScheduledCall(data: {
    channelId: string;
    createdById: string;
    title: string;
    callType: ScheduledCallType;
    scheduledStartAt: Date;
    scheduledEndAt: Date;
    durationMinutes: number;
    timezone: string;
    participantUserIds: { userId: string; email?: string }[];
  }) {
    return prisma.scheduledCall.create({
      data: {
        channelId: data.channelId,
        createdById: data.createdById,
        title: data.title,
        callType: data.callType,
        status: ScheduledCallStatus.SCHEDULED,
        scheduledStartAt: data.scheduledStartAt,
        scheduledEndAt: data.scheduledEndAt,
        durationMinutes: data.durationMinutes,
        timezone: data.timezone,
        calendarSyncStatus: CalendarSyncStatus.PENDING,
        participants: {
          create: data.participantUserIds.map((p) => ({
            userId: p.userId,
            email: p.email,
            role: p.userId === data.createdById ? 'ORGANIZER' : 'ATTENDEE'
          }))
        }
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } }
          }
        }
      }
    });
  }

  public async rescheduleCall(
    id: string,
    data: {
      title?: string;
      scheduledStartAt: Date;
      scheduledEndAt: Date;
      durationMinutes: number;
      timezone?: string;
    }
  ) {
    return prisma.scheduledCall.update({
      where: { id },
      data: {
        ...(data.title ? { title: data.title } : {}),
        scheduledStartAt: data.scheduledStartAt,
        scheduledEndAt: data.scheduledEndAt,
        durationMinutes: data.durationMinutes,
        ...(data.timezone ? { timezone: data.timezone } : {}),
        calendarSyncStatus: CalendarSyncStatus.PENDING
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } }
          }
        }
      }
    });
  }

  public async cancelCall(id: string, cancelledById: string) {
    return prisma.scheduledCall.update({
      where: { id },
      data: {
        status: ScheduledCallStatus.CANCELLED,
        calendarSyncStatus: CalendarSyncStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true, avatarUrl: true } },
        participants: {
          include: {
            user: { select: { id: true, name: true, email: true, avatarUrl: true } }
          }
        }
      }
    });
  }
}

export const scheduledCallRepository = new ScheduledCallRepository();
