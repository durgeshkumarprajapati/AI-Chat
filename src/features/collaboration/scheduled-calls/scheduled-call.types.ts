import { z } from 'zod';
import { ScheduledCallStatus, ScheduledCallType, CalendarSyncStatus, ScheduledCallParticipantStatus } from '@prisma/client';

export const CreateScheduledCallSchema = z.object({
  channelId: z.string().uuid(),
  title: z.string().min(1).max(120),
  scheduledStartAt: z.string().datetime(),
  durationMinutes: z.number().int().positive().max(480).default(30),
  timezone: z.string().default('UTC'),
  participantUserIds: z.array(z.string().uuid()).optional()
});

export const RescheduleCallSchema = z.object({
  scheduledStartAt: z.string().datetime(),
  durationMinutes: z.number().int().positive().max(480).optional(),
  timezone: z.string().optional(),
  title: z.string().min(1).max(120).optional()
});

export type CreateScheduledCallInput = z.input<typeof CreateScheduledCallSchema>;
export type RescheduleCallInput = z.input<typeof RescheduleCallSchema>;

export interface ScheduledCallParticipantDTO {
  id: string;
  userId: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  role: string;
  responseStatus: ScheduledCallParticipantStatus;
}

export interface ScheduledCallDTO {
  id: string;
  channelId: string;
  createdById: string;
  title: string;
  callType: ScheduledCallType;
  status: ScheduledCallStatus;
  scheduledStartAt: string;
  scheduledEndAt: string;
  durationMinutes: number;
  timezone: string;
  googleCalendarEventId?: string | null;
  googleCalendarEventUrl?: string | null;
  googleMeetUrl?: string | null;
  googleMeetConferenceId?: string | null;
  calendarSyncStatus: CalendarSyncStatus;
  calendarSyncError?: string | null;
  calendarSyncErrorCode?: string | null;
  calendarSyncAttempts: number;
  lastCalendarSyncAt?: string | null;
  cancelledAt?: string | null;
  cancelledById?: string | null;
  createdAt: string;
  updatedAt: string;
  participants: ScheduledCallParticipantDTO[];
}
