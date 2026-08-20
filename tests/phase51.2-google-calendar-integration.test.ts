import { googleAuthService } from '@/features/integrations/google/google-auth.service';
import { googleCalendarService } from '@/features/calendar/google-calendar.service';
import { scheduledMockTestService } from '@/features/study/scheduled-mock-test.service';
import { prisma } from '@/lib/prisma';
import { envConfig } from '@/config/env';

describe('Phase 51.2 — Google Calendar Integration & Production Diagnostic Tests', () => {
  let testUser: any;

  beforeAll(async () => {
    // Find or create test user
    testUser = await prisma.user.findFirst({ where: { email: 'phase51_2_test@example.com' } });
    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          email: 'phase51_2_test@example.com',
          name: 'Phase 51.2 Test User',
          passwordHash: 'dummy_hash'
        }
      });
    }
  });

  beforeEach(async () => {
    // Reset user integration
    await prisma.googleIntegration.deleteMany({ where: { userId: testUser.id } });
  });

  afterAll(async () => {
    try {
      await prisma.googleIntegration.deleteMany({ where: { userId: testUser.id } });
      await prisma.scheduledMockTest.deleteMany({ where: { createdById: testUser.id } });
      await prisma.user.deleteMany({ where: { id: testUser.id } });
    } catch {
      // safe cleanup
    }
  });

  test('1. Environment Configuration exposes centralized Google settings', () => {
    expect(envConfig.google).toBeDefined();
    expect(envConfig.google.redirectUri).toContain('/api/integrations/google/callback');
    expect(envConfig.google.calendarScope).toBe('https://www.googleapis.com/auth/calendar.events');
  });

  test('2. Returns NOT_CONNECTED status when user has not connected Google Calendar', async () => {
    const status = await googleAuthService.getStatus(testUser.id);
    expect(status.connected).toBe(false);
    expect(status.calendarAccess).toBe(false);
    expect(status.accountEmail).toBeNull();
    expect(status.calendarId).toBe('primary');

    const tokenRes = await googleAuthService.getValidAccessToken(testUser.id);
    expect(tokenRes.status).toBe('NOT_CONNECTED');
  });

  test('3. Saves encrypted tokens & returns safe diagnostic status without exposing secret tokens', async () => {
    await googleAuthService.saveGoogleTokens(
      testUser.id,
      'raw_access_token_xyz',
      'raw_refresh_token_abc',
      'user_diagnostic@gmail.com',
      'google_user_123',
      'https://www.googleapis.com/auth/calendar.events'
    );

    const status = await googleAuthService.getStatus(testUser.id);
    expect(status.connected).toBe(true);
    expect(status.calendarAccess).toBe(true);
    expect(status.accountEmail).toBe('user_diagnostic@gmail.com');
    expect((status as any).accessToken).toBeUndefined();
    expect((status as any).refreshToken).toBeUndefined();

    // Verify token is encrypted at rest in DB
    const record = await prisma.googleIntegration.findUnique({ where: { userId: testUser.id } });
    expect(record?.encryptedAccessToken).not.toBe('raw_access_token_xyz');
    expect(googleAuthService.decryptToken(record!.encryptedAccessToken)).toBe('raw_access_token_xyz');
  });

  test('4. Token Refresh automatically triggers when access token is expired', async () => {
    const expiredDate = new Date(Date.now() - 3600 * 1000); // 1 hour ago
    await prisma.googleIntegration.create({
      data: {
        userId: testUser.id,
        email: 'expired_user@gmail.com',
        encryptedAccessToken: googleAuthService.encryptToken('expired_access_token'),
        encryptedRefreshToken: googleAuthService.encryptToken('mock_refresh_token_valid'),
        tokenExpiresAt: expiredDate,
        scope: 'https://www.googleapis.com/auth/calendar.events'
      }
    });

    const tokenResult = await googleAuthService.getValidAccessToken(testUser.id);
    expect(tokenResult.status).toBe('VALID');
    if (tokenResult.status === 'VALID') {
      expect(tokenResult.accessToken).toContain('mock_access_token_');
    }
  });

  test('5. Re-authorization required state when token is expired and refresh token is missing', async () => {
    const expiredDate = new Date(Date.now() - 3600 * 1000);
    await prisma.googleIntegration.create({
      data: {
        userId: testUser.id,
        email: 'no_refresh@gmail.com',
        encryptedAccessToken: googleAuthService.encryptToken('expired_access_token'),
        encryptedRefreshToken: null,
        tokenExpiresAt: expiredDate,
        scope: 'https://www.googleapis.com/auth/calendar.events'
      }
    });

    const tokenResult = await googleAuthService.getValidAccessToken(testUser.id);
    expect(tokenResult.status).toBe('REAUTH_REQUIRED');
  });

  test('6. Calendar Event Creation via API with deterministic event ID, sendUpdates=all, and reminders', async () => {
    await googleAuthService.saveGoogleTokens(
      testUser.id,
      'mock_access_token_test',
      'mock_refresh_token_test',
      'creator@gmail.com',
      'g_123',
      'https://www.googleapis.com/auth/calendar.events'
    );

    const eventDetails = {
      mockTestId: 'test-mock-uuid-12345',
      title: '📝 Distributed Systems Quiz',
      startTime: new Date(Date.now() + 3600000),
      endTime: new Date(Date.now() + 5400000)
    };

    const res = await googleCalendarService.createCalendarEventViaApi(
      testUser.id,
      eventDetails,
      ['student1@example.com', 'student2@example.com']
    );

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.eventId).toBe('testmockuuid12345');
      expect(res.htmlLink).toContain(res.eventId);
      expect(res.verified).toBe(true);
    }
  });

  test('7. Calendar Failure does NOT roll back or corrupt scheduled mock test persistence', async () => {
    // User is NOT connected to Google Calendar
    const mockTest = await scheduledMockTestService.scheduleMockTest(testUser.id, {
      title: 'Isolated Test Without Calendar Connection',
      topic: 'Software Architecture',
      scheduledStartTime: new Date(Date.now() + 7200000),
      durationMinutes: 45,
      totalQuestions: 5
    });

    expect(mockTest.id).toBeDefined();
    expect(mockTest.title).toBe('Isolated Test Without Calendar Connection');
    expect(mockTest.googleCalendarSyncStatus).toBe('NOT_CONNECTED');
    expect(mockTest.googleCalendarLink).toContain('calendar.google.com/calendar/render');
  });

  test('8. Deterministic Event ID Sanitization enforces Google Calendar requirements', () => {
    const rawId = '550e8400-e29b-41d4-a716-446655440000';
    const sanitized = googleCalendarService.generateDeterministicEventId(rawId);
    expect(sanitized).toBe('550e8400e29b41d4a716446655440000');
    expect(/^[a-v0-9]+$/.test(sanitized)).toBe(true);
  });
});
