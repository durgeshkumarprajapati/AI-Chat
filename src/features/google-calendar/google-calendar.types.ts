import { CalendarSyncStatus } from '@prisma/client';

export interface CalendarEventPayload {
  mockTestId: string;
  userId: string;
  title: string;
  description?: string;
  topic?: string;
  scheduledStartTime: Date;
  durationMinutes: number;
  totalQuestions: number;
  timeZone?: string;
  attendeeEmails?: string[];
}

export interface SyncResult {
  success: boolean;
  syncId: string;
  status: CalendarSyncStatus;
  eventId?: string | null;
  eventHtmlLink?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  attemptCount: number;
}

export interface RetryJobRecord {
  id: string;
  mockTestId: string;
  userId: string;
  status: CalendarSyncStatus;
  attemptCount: number;
  nextRetryAt: Date | null;
}
