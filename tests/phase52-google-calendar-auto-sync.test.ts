import { googleAuthService } from '@/features/integrations/google/google-auth.service';
import { calendarSyncService } from '@/features/google-calendar/google-calendar.service';
import { googleCalendarRepository } from '@/features/google-calendar/google-calendar.repository';
import { calendarIdempotencyService } from '@/features/google-calendar/google-calendar.idempotency';
import { calendarRetryService } from '@/features/google-calendar/google-calendar.retry.service';
import { scheduledMockTestService } from '@/features/study/scheduled-mock-test.service';
import { workerCalendarSyncProcessor } from '../worker/src/processors/calendar-sync.processor';
import { prisma } from '@/lib/prisma';

describe('Phase 52 — Production Google Calendar Auto-Sync, Idempotency & Lifecycle Tests', () => {
  let testUser: any;
  let secondaryUser: any;

  beforeAll(async () => {
    // Create primary test user
    testUser = await prisma.user.findFirst({ where: { email: 'phase52_primary@example.com' } });
    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          email: 'phase52_primary@example.com',
          name: 'Phase 52 Primary User',
          passwordHash: 'dummy_hash'
        }
      });
    }

    // Create secondary attendee user
    secondaryUser = await prisma.user.findFirst({ where: { email: 'phase52_secondary@example.com' } });
    if (!secondaryUser) {
      secondaryUser = await prisma.user.create({
        data: {
          email: 'phase52_secondary@example.com',
          name: 'Phase 52 Secondary User',
          passwordHash: 'dummy_hash'
        }
      });
    }
  });

  beforeEach(async () => {
    await prisma.mockTestCalendarSync.deleteMany({
      where: { userId: { in: [testUser.id, secondaryUser.id] } }
    });
    await prisma.googleIntegration.deleteMany({
      where: { userId: { in: [testUser.id, secondaryUser.id] } }
    });
  });

  afterAll(async () => {
    try {
      await prisma.mockTestCalendarSync.deleteMany({
        where: { userId: { in: [testUser.id, secondaryUser.id] } }
      });
      await prisma.scheduledMockTest.deleteMany({
        where: { createdById: { in: [testUser.id, secondaryUser.id] } }
      });
      await prisma.user.deleteMany({
        where: { id: { in: [testUser.id, secondaryUser.id] } }
      });
    } catch {
      // safe cleanup
    }
  });

  test('1. Automatic Google Calendar event creation when user has connected OAuth', async () => {
    await googleAuthService.saveGoogleTokens(
      testUser.id,
      'mock_access_token_auto',
      'mock_refresh_token_auto',
      'phase52_primary@gmail.com',
      'g_p52_1',
      'https://www.googleapis.com/auth/calendar.events'
    );

    const mockTest = await scheduledMockTestService.scheduleMockTest(testUser.id, {
      title: 'Auto Sync MCQ Assessment',
      topic: 'Cloud Microservices',
      scheduledStartTime: new Date(Date.now() + 3600000),
      durationMinutes: 30,
      totalQuestions: 5
    });

    expect(mockTest.googleCalendarSyncStatus).toBe('SYNCED');
    expect(mockTest.googleCalendarEventId).toBeDefined();
    expect(mockTest.googleCalendarEventUrl).toContain(mockTest.googleCalendarEventId!);

    const syncRecord = await googleCalendarRepository.findSyncRecord(mockTest.id, testUser.id);
    expect(syncRecord).not.toBeNull();
    expect(syncRecord?.status).toBe('SYNCED');
  });

  test('2. Deterministic event ID generator satisfies Google Calendar API constraints and idempotency', () => {
    const mockTestId = 'c0a80101-0000-0000-0000-000000000001';
    const eventId1 = calendarIdempotencyService.generateEventId(mockTestId, testUser.id);
    const eventId2 = calendarIdempotencyService.generateEventId(mockTestId, testUser.id);

    expect(eventId1).toBe(eventId2);
    expect(eventId1.length).toBeGreaterThanOrEqual(5);
    expect(/^[a-v0-9]+$/.test(eventId1)).toBe(true);
  });

  test('3. Duplicate sync attempt on same mock test avoids creating duplicate events', async () => {
    await googleAuthService.saveGoogleTokens(
      testUser.id,
      'mock_access_token_idempotent',
      'mock_refresh_token_idempotent',
      'phase52_primary@gmail.com',
      'g_p52_1',
      'https://www.googleapis.com/auth/calendar.events'
    );

    const mockTest = await scheduledMockTestService.scheduleMockTest(testUser.id, {
      title: 'Idempotency Check Quiz',
      topic: 'Database Systems',
      scheduledStartTime: new Date(Date.now() + 7200000),
      durationMinutes: 45
    });

    const firstEventId = mockTest.googleCalendarEventId;

    // Trigger second sync explicitly
    const secondSync = await calendarSyncService.synchronizeMockTest(mockTest.id, testUser.id);
    expect(secondSync?.eventId).toBe(firstEventId);
    expect(secondSync?.status).toBe('SYNCED');
  });

  test('4. Rescheduling test updates calendar sync state', async () => {
    await googleAuthService.saveGoogleTokens(
      testUser.id,
      'mock_access_token_reschedule',
      'mock_refresh_token_reschedule',
      'phase52_primary@gmail.com',
      'g_p52_1',
      'https://www.googleapis.com/auth/calendar.events'
    );

    const mockTest = await scheduledMockTestService.scheduleMockTest(testUser.id, {
      title: 'Rescheduled Test',
      scheduledStartTime: new Date(Date.now() + 3600000),
      durationMinutes: 30
    });

    await calendarSyncService.rescheduleCalendarEvent(mockTest.id);
    const syncRecord = await googleCalendarRepository.findSyncRecord(mockTest.id, testUser.id);
    expect(syncRecord?.status).toBe('SYNCED');
  });

  test('5. Cancellation removes calendar sync state', async () => {
    await googleAuthService.saveGoogleTokens(
      testUser.id,
      'mock_access_token_cancel',
      'mock_refresh_token_cancel',
      'phase52_primary@gmail.com',
      'g_p52_1',
      'https://www.googleapis.com/auth/calendar.events'
    );

    const mockTest = await scheduledMockTestService.scheduleMockTest(testUser.id, {
      title: 'Cancelled Test',
      scheduledStartTime: new Date(Date.now() + 3600000),
      durationMinutes: 30
    });

    await calendarSyncService.cancelCalendarEvent(mockTest.id);
    const syncRecord = await googleCalendarRepository.findSyncRecord(mockTest.id, testUser.id);
    expect(syncRecord?.status).toBe('CANCELLED');
  });

  test('6. Worker processes pending & retry jobs atomically', async () => {
    await googleAuthService.saveGoogleTokens(
      testUser.id,
      'mock_access_token_worker',
      'mock_refresh_token_worker',
      'phase52_primary@gmail.com',
      'g_p52_1',
      'https://www.googleapis.com/auth/calendar.events'
    );

    const mockTest = await prisma.scheduledMockTest.create({
      data: {
        createdById: testUser.id,
        title: 'Worker Queue Test',
        scheduledStartTime: new Date(Date.now() + 3600000),
        durationMinutes: 30,
        totalQuestions: 5,
        questions: []
      }
    });

    await googleCalendarRepository.upsertPendingRecord(mockTest.id, testUser.id);

    const workerResult = await workerCalendarSyncProcessor.processPendingAndRetryJobs();
    expect(workerResult.processed).toBeGreaterThanOrEqual(1);

    const syncRecord = await googleCalendarRepository.findSyncRecord(mockTest.id, testUser.id);
    expect(syncRecord?.status).toBe('SYNCED');
  });

  test('7. Unconnected user moves sync record to NOT_CONNECTED without breaking test creation', async () => {
    const mockTest = await scheduledMockTestService.scheduleMockTest(testUser.id, {
      title: 'Unconnected User Test',
      scheduledStartTime: new Date(Date.now() + 3600000)
    });

    expect(mockTest.id).toBeDefined();
    expect(mockTest.googleCalendarSyncStatus).toBe('NOT_CONNECTED');
    expect(mockTest.googleCalendarLink).toContain('calendar.google.com/calendar/render');
  });

  test('8. CalendarRetryService processes pending records cleanly', async () => {
    const result = await calendarRetryService.processPendingAndRetryJobs();
    expect(result).toHaveProperty('processed');
    expect(result).toHaveProperty('successCount');
    expect(result).toHaveProperty('failureCount');
  });
});
