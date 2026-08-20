import { envConfig } from '@/config/env';
import { googleAuthService as authGoogleAuthService } from '@/features/auth/google-auth.service';
import { googleAuthService as integrationGoogleAuthService } from '@/features/integrations/google/google-auth.service';
import { scheduledMockTestService } from '@/features/study/scheduled-mock-test.service';
import { prisma } from '@/lib/prisma';

describe('Phase 53 — Separate Google Sign-In OAuth from Google Calendar OAuth', () => {
  let testUser: any;

  beforeAll(async () => {
    process.env.GOOGLE_AUTH_REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback';
    testUser = await prisma.user.findFirst({ where: { email: 'phase53_test@example.com' } });
    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          email: 'phase53_test@example.com',
          name: 'Phase 53 Test User',
          passwordHash: 'dummy_hash'
        }
      });
    }
  });

  afterAll(async () => {
    try {
      await prisma.mockTestCalendarSync.deleteMany({ where: { userId: testUser.id } });
      await prisma.googleIntegration.deleteMany({ where: { userId: testUser.id } });
      await prisma.scheduledMockTest.deleteMany({ where: { createdById: testUser.id } });
      await prisma.user.deleteMany({ where: { id: testUser.id } });
    } catch {
      // safe cleanup
    }
  });

  test('1. Centralized Environment Configuration cleanly separates Google Auth from Google Calendar', () => {
    expect(envConfig.google.auth).toBeDefined();
    expect(envConfig.google.calendar).toBeDefined();

    expect(envConfig.google.auth.redirectUri).toContain('/api/auth/google/callback');
    expect(envConfig.google.auth.scopes).toBe('openid email profile');

    expect(envConfig.google.calendar.redirectUri).toContain('/api/integrations/google/callback');
    expect(envConfig.google.calendar.scope).toBe('https://www.googleapis.com/auth/calendar.events');
  });

  test('2. Google Sign-In URL uses GOOGLE_AUTH_REDIRECT_URI and openid/email/profile scopes', () => {
    const signInUrl = authGoogleAuthService.getSignInAuthUrl();

    expect(signInUrl).toContain(encodeURIComponent('http://localhost:3000/api/auth/google/callback'));
    expect(signInUrl).toContain(encodeURIComponent('openid email profile'));
    expect(signInUrl).not.toContain(encodeURIComponent('calendar.events'));
  });

  test('3. Google Calendar URL uses GOOGLE_REDIRECT_URI and calendar.events scope', () => {
    const calendarUrl = integrationGoogleAuthService.getGoogleAuthUrl(testUser.id);

    expect(calendarUrl).toContain(encodeURIComponent('http://localhost:3000/api/integrations/google/callback'));
    expect(calendarUrl).toContain(encodeURIComponent('https://www.googleapis.com/auth/calendar.events'));
    expect(calendarUrl).toContain(`state=${testUser.id}`);
  });

  test('4. Google Sign-In authentication does NOT auto-grant Calendar access', async () => {
    const { user } = await authGoogleAuthService.handleGoogleAuth({
      googleId: 'g_sign_in_only_123',
      email: 'signin_only@example.com',
      emailVerified: true,
      name: 'Sign In Only User'
    });

    const status = await integrationGoogleAuthService.getStatus(user.id);
    expect(status.connected).toBe(false);
    expect(status.calendarAccess).toBe(false);

    // Clean up
    await prisma.user.delete({ where: { id: user.id } });
  });

  test('5. Phase 52 Google Calendar Auto-Sync continues working when Calendar OAuth is connected', async () => {
    await integrationGoogleAuthService.saveGoogleTokens(
      testUser.id,
      'mock_access_token_p53',
      'mock_refresh_token_p53',
      'phase53_test@gmail.com',
      'g_p53_1',
      'https://www.googleapis.com/auth/calendar.events'
    );

    const mockTest = await scheduledMockTestService.scheduleMockTest(testUser.id, {
      title: 'Phase 53 Regression Mock Test',
      scheduledStartTime: new Date(Date.now() + 3600000),
      durationMinutes: 30
    });

    expect(mockTest.googleCalendarSyncStatus).toBe('SYNCED');
    expect(mockTest.googleCalendarEventUrl).toBeDefined();
  });
});
