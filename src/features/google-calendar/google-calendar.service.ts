import { prisma } from '@/lib/prisma';
import { googleCalendarRepository } from './google-calendar.repository';
import { googleCalendarService } from '@/features/calendar/google-calendar.service';
import { calendarIdempotencyService } from './google-calendar.idempotency';
import { calendarTelemetryService } from './google-calendar.telemetry.service';
import { classifyGoogleError } from './google-calendar.errors';
import { envConfig } from '@/config/env';

export class CalendarSyncService {
  /**
   * Main Idempotent Google Calendar Auto-Sync orchestrator for a scheduled mock test
   */
  public async synchronizeMockTest(mockTestId: string, userId: string) {
    const startTimeMs = Date.now();

    // 1. Get or create pending sync record
    let syncRecord = await googleCalendarRepository.findSyncRecord(mockTestId, userId);
    if (!syncRecord) {
      syncRecord = await googleCalendarRepository.upsertPendingRecord(mockTestId, userId);
    }

    // 2. Claim job atomically
    const claimed = await googleCalendarRepository.claimJobForSync(syncRecord.id);
    if (!claimed && syncRecord.status === 'SYNCING') {
      console.log(`[CalendarSync] Job syncId=${syncRecord.id} is already SYNCING in another thread`);
      return syncRecord;
    }

    const currentAttempt = syncRecord.attemptCount + 1;
    calendarTelemetryService.logSyncStarted(mockTestId, userId, currentAttempt);

    // 3. Retrieve ScheduledMockTest details & authorized participants
    const mockTest = await prisma.scheduledMockTest.findUnique({
      where: { id: mockTestId },
      include: {
        participants: {
          include: {
            user: { select: { email: true } }
          }
        }
      }
    });

    if (!mockTest) {
      await googleCalendarRepository.markFailed(
        syncRecord.id,
        mockTestId,
        'MOCK_TEST_NOT_FOUND',
        'Scheduled mock test record not found',
        false,
        null
      );
      return syncRecord;
    }

    // Determine participant attendee emails (deduplicated)
    const attendeeEmails = Array.from(
      new Set(
        mockTest.participants
          .map((p) => p.user?.email)
          .filter((e): e is string => Boolean(e && e.trim().length > 0))
      )
    );

    const scheduledStart = new Date(mockTest.scheduledStartTime);
    const scheduledEnd = new Date(scheduledStart.getTime() + mockTest.durationMinutes * 60 * 1000);
    const deterministicEventId = calendarIdempotencyService.generateEventId(mockTestId, userId);

    const eventDetails = {
      mockTestId: deterministicEventId,
      title: `📝 AI Mock Test: ${mockTest.title}`,
      description: `Topic: ${mockTest.topic || mockTest.title}\nQuestions: ${mockTest.totalQuestions} MCQs\nDuration: ${mockTest.durationMinutes} Minutes\nPlatform: Document AI Platform`,
      startTime: scheduledStart,
      endTime: scheduledEnd
    };

    // 4. Invoke API creation via GoogleCalendarService
    const apiResult = await googleCalendarService.createCalendarEventViaApi(userId, eventDetails, attendeeEmails);

    if (apiResult.success) {
      await googleCalendarRepository.markSynced(
        syncRecord.id,
        mockTestId,
        apiResult.eventId,
        apiResult.htmlLink
      );
      const durationMs = Date.now() - startTimeMs;
      calendarTelemetryService.logSyncSuccess(mockTestId, userId, apiResult.eventId, durationMs);
      calendarTelemetryService.logEventCreated(mockTestId, apiResult.eventId, apiResult.htmlLink);
      if (attendeeEmails.length > 0) {
        calendarTelemetryService.logAttendeesUpdated(mockTestId, apiResult.eventId, attendeeEmails.length);
      }

      return googleCalendarRepository.findSyncRecord(mockTestId, userId);
    }

    // 5. Handle Failure & Exponential Backoff
    if (apiResult.errorCode === 'GOOGLE_CALENDAR_NOT_CONNECTED') {
      await googleCalendarRepository.markNotConnected(syncRecord.id, mockTestId, apiResult.error);
      return googleCalendarRepository.findSyncRecord(mockTestId, userId);
    }

    const errorInfo = classifyGoogleError(undefined, apiResult.error);

    if (errorInfo.isAuthFailure) {
      await googleCalendarRepository.markReauthRequired(syncRecord.id, mockTestId, apiResult.error);
      calendarTelemetryService.logReauthRequired(mockTestId, userId, apiResult.error);
      return googleCalendarRepository.findSyncRecord(mockTestId, userId);
    }

    // Calculate exponential backoff retry time
    const backoffMinutes = [1, 5, 15, 30, 60];
    const maxAttempts = envConfig.google.maxRetries || 5;

    if (errorInfo.isTransient && currentAttempt <= maxAttempts) {
      const delayMinutes = backoffMinutes[Math.min(currentAttempt - 1, backoffMinutes.length - 1)] || 5;
      const nextRetryAt = new Date(Date.now() + delayMinutes * 60 * 1000);

      await googleCalendarRepository.markFailed(
        syncRecord.id,
        mockTestId,
        errorInfo.errorCode,
        apiResult.error,
        true,
        nextRetryAt
      );

      calendarTelemetryService.logSyncRetryScheduled(mockTestId, userId, currentAttempt, nextRetryAt);
    } else {
      await googleCalendarRepository.markFailed(
        syncRecord.id,
        mockTestId,
        errorInfo.errorCode,
        apiResult.error,
        false,
        null
      );
      calendarTelemetryService.logSyncFailed(mockTestId, userId, errorInfo.errorCode, apiResult.error);
    }

    return googleCalendarRepository.findSyncRecord(mockTestId, userId);
  }

  /**
   * Reschedule synchronization: updates start/end time of existing Google Calendar event
   */
  public async rescheduleCalendarEvent(mockTestId: string) {
    const syncRecords = await googleCalendarRepository.findSyncRecordsForMockTest(mockTestId);
    for (const record of syncRecords) {
      if (record.status === 'SYNCED' && record.eventId) {
        calendarTelemetryService.logEventUpdated(mockTestId, record.eventId);
        // Synchronize updated time
        await this.synchronizeMockTest(mockTestId, record.userId);
      }
    }
  }

  /**
   * Cancellation synchronization: removes Google Calendar event and marks sync as CANCELLED
   */
  public async cancelCalendarEvent(mockTestId: string) {
    calendarTelemetryService.logEventDeleted(mockTestId, 'all');
    await googleCalendarRepository.markCancelled(mockTestId);
  }
}

export const calendarSyncService = new CalendarSyncService();
