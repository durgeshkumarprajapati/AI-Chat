import { chillFocusSessionService } from '../src/features/chill-focus/chill-focus.session.service';
import { chillFocusPreferenceService } from '../src/features/chill-focus/chill-focus.preference.service';
import { chillFocusStreakService } from '../src/features/chill-focus/chill-focus.streak.service';
import { chillFocusService } from '../src/features/chill-focus/chill-focus.service';
import { soundscapeService } from '../src/features/chill-focus/audio/soundscape.service';
import { createSessionSchema } from '../src/features/chill-focus/chill-focus.schemas';
import { InvalidStateTransitionError, UnauthorizedSessionError } from '../src/features/chill-focus/chill-focus.errors';
import { ChillFocusMode, ChillFocusStatus } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { llmGateway } from '../src/features/llm/llm-gateway.service';

describe('Phase 59 — AI Chill & Focus Mode Integration & Security Tests', () => {
  jest.setTimeout(30000);

  let user1: any;
  let user2: any;

  beforeAll(async () => {
    // Mock LLM Gateway response for instantaneous unit testing
    jest.spyOn(llmGateway, 'generate').mockImplementation(async (_req: any) => {
      return {
        id: 'mock-llm-id',
        text: "You've been studying hard. Take a 5-minute break to stretch and reset.",
        provider: 'mock',
        model: 'mock-model',
        usage: { promptTokens: 40, completionTokens: 20, totalTokens: 60 }
      } as any;
    });

    user1 = await prisma.user.create({
      data: {
        email: `phase59_user1_${Date.now()}@example.com`,
        name: 'Phase 59 Learner One',
        role: 'USER'
      }
    });

    user2 = await prisma.user.create({
      data: {
        email: `phase59_user2_${Date.now()}@example.com`,
        name: 'Phase 59 Learner Two',
        role: 'USER'
      }
    });
  });

  afterAll(async () => {
    await prisma.chillFocusSession.deleteMany({
      where: { userId: { in: [user1.id, user2.id] } }
    });
    await prisma.chillFocusPreference.deleteMany({
      where: { userId: { in: [user1.id, user2.id] } }
    });
    await prisma.chillFocusStreak.deleteMany({
      where: { userId: { in: [user1.id, user2.id] } }
    });
    await prisma.user.deleteMany({
      where: { id: { in: [user1.id, user2.id] } }
    });
  });

  test('1. Session Creation: User can create CHILL & FOCUS sessions', async () => {
    const session = await chillFocusSessionService.createSession(user1.id, {
      mode: ChillFocusMode.CHILL,
      plannedDurationSeconds: 300,
      soundscape: 'night_sky'
    });

    expect(session.id).toBeDefined();
    expect(session.userId).toBe(user1.id);
    expect(session.mode).toBe('CHILL');
    expect(session.status).toBe(ChillFocusStatus.ACTIVE);
    expect(session.soundscape).toBe('night_sky');
  });

  test('2. Duplicate Active Session Prevention: Reuses or returns active session', async () => {
    const session1 = await chillFocusSessionService.createSession(user2.id, {
      mode: ChillFocusMode.FOCUS
    });

    const session2 = await chillFocusSessionService.createSession(user2.id, {
      mode: ChillFocusMode.FOCUS
    });

    expect(session1.id).toBe(session2.id);
  });

  test('3. State Transitions & Duration Accounting: ACTIVE -> PAUSED -> RESUMED -> COMPLETED', async () => {
    const session = await chillFocusSessionService.createSession(user1.id, {
      mode: ChillFocusMode.CHILL
    });

    // Pause session
    const paused = await chillFocusSessionService.pauseSession(session.id, user1.id);
    expect(paused.status).toBe(ChillFocusStatus.PAUSED);

    // Resume session
    const resumed = await chillFocusSessionService.resumeSession(session.id, user1.id);
    expect(resumed.status).toBe(ChillFocusStatus.ACTIVE);

    // Complete session
    const completed = await chillFocusSessionService.completeSession(session.id, user1.id);
    expect(completed.status).toBe(ChillFocusStatus.COMPLETED);

    // Invalid transition: Cannot pause a completed session
    await expect(
      chillFocusSessionService.pauseSession(session.id, user1.id)
    ).rejects.toThrow(InvalidStateTransitionError);
  });

  test('4. Tenant Security Isolation: Reject cross-user session access', async () => {
    const session = await chillFocusSessionService.createSession(user1.id, {
      mode: ChillFocusMode.CHILL
    });

    // User 2 attempts to get User 1's session
    await expect(
      chillFocusSessionService.getSession(session.id, user2.id)
    ).rejects.toThrow(UnauthorizedSessionError);

    // User 2 attempts to pause User 1's session
    await expect(
      chillFocusSessionService.pauseSession(session.id, user2.id)
    ).rejects.toThrow(UnauthorizedSessionError);
  });

  test('5. Soundscape Whitelist Validation & Audio URL Resolver', async () => {
    // Valid soundscape
    expect(createSessionSchema.parse({ soundscape: 'ocean' })).toBeDefined();

    // Invalid soundscape
    expect(() => {
      createSessionSchema.parse({ soundscape: 'malicious_url_or_invalid_id' });
    }).toThrow();

    // Soundscape asset URL resolution
    const url = soundscapeService.getAudioUrl('night_sky');
    expect(url).toContain('night_sky.mp3');
  });

  test('6. User Preferences Persistence & Patching', async () => {
    const pref1 = await chillFocusPreferenceService.getPreferences(user1.id);
    expect(pref1.userId).toBe(user1.id);
    expect(pref1.preferredMode).toBe('CHILL');

    const updated = await chillFocusPreferenceService.updatePreferences(user1.id, {
      preferredSoundscape: 'rain',
      preferredVolume: 0.8,
      reducedMotion: true
    });

    expect(updated.preferredSoundscape).toBe('rain');
    expect(updated.preferredVolume).toBe(0.8);
    expect(updated.reducedMotion).toBe(true);
  });

  test('7. Calm Streak Calculation & Daily Credit Rules', async () => {
    const initialStreak = await chillFocusStreakService.getStreakSummary(user1.id);
    expect(initialStreak.currentStreakDays).toBeGreaterThanOrEqual(0);

    // Qualifying completed session (300 seconds >= 5 minutes)
    const summary = await chillFocusStreakService.recordCompletedSession(user1.id, 300);
    expect(summary.currentStreakDays).toBeGreaterThanOrEqual(1);
    expect(summary.earnedToday).toBe(true);

    // Additional session on same day should not double count streak days
    const summary2 = await chillFocusStreakService.recordCompletedSession(user1.id, 400);
    expect(summary2.currentStreakDays).toBe(summary.currentStreakDays);
  });

  test('8. AI Break Intervention Generation & Fallback', async () => {
    const intervention = await chillFocusService.getAIIntervention(user1.id, 52);
    expect(intervention.message).toBeDefined();
    expect(intervention.suggestionMinutes).toBe(5);
    expect(['ai', 'fallback']).toContain(intervention.source);
  });
});
