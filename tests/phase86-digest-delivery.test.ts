// Phase 86 — the Delivery Decision Engine (intelligence-delivery.service.ts). This file contains
// the single most important test in this phase per the spec's "FINAL PRINCIPLE": generateSnapshot
// / the LLM is NEVER called from the delivery path — proven with a spy across every scenario.
jest.mock('@/lib/prisma', () => ({
  prisma: {
    aIIntelligencePreference: { findUnique: jest.fn(), upsert: jest.fn() },
    notificationDelivery: { create: jest.fn() }
  }
}));
jest.mock('@/features/config', () => ({
  configService: { getBoolean: jest.fn(), getNumber: jest.fn() }
}));
jest.mock('@/features/billing/entitlement.service', () => ({
  entitlementService: { canAccessFeature: jest.fn() }
}));
jest.mock('@/features/ai-intelligence/services/ai-intelligence.service', () => ({
  aiIntelligenceService: { getSnapshot: jest.fn(), generateSnapshot: jest.fn() }
}));
jest.mock('@/features/notifications/notification.service', () => ({
  notificationService: { createNotification: jest.fn() }
}));
jest.mock('@/features/notifications/notification-rate-limit.service', () => ({
  notificationRateLimitService: {
    checkHourlyLimit: jest.fn(),
    checkDailyLimit: jest.fn(),
    checkCriticalDailyLimit: jest.fn()
  }
}));
jest.mock('@/lib/rabbitmq', () => ({
  rabbitmq: { publishToQueue: jest.fn().mockResolvedValue(true) },
  QUEUES: { NOTIFICATION_EMAIL: 'notification-email', NOTIFICATION_DISPATCH: 'notification-dispatch' }
}));

import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config';
import { entitlementService } from '@/features/billing/entitlement.service';
import { aiIntelligenceService } from '@/features/ai-intelligence/services/ai-intelligence.service';
import { notificationService } from '@/features/notifications/notification.service';
import { notificationRateLimitService } from '@/features/notifications/notification-rate-limit.service';
import { rabbitmq } from '@/lib/rabbitmq';
import { intelligenceDeliveryService } from '@/features/notifications/intelligence-delivery.service';
import { SnapshotDTO } from '@/features/ai-intelligence/types/ai-intelligence.types';

function makeSnapshot(overrides: Partial<SnapshotDTO> = {}): SnapshotDTO {
  return {
    id: 'snap-1',
    type: 'DAILY',
    status: 'READY',
    periodStart: '2026-08-31T00:00:00.000Z',
    periodEnd: '2026-08-31T23:59:59.999Z',
    summary: 'All quiet on the workspace front.',
    structuredData: {},
    generatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    usedLLM: false,
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

const DEFAULT_PREF_ROW = {
  userId: 'user-1',
  dailyEnabled: true,
  weeklyEnabled: true,
  inAppEnabled: true,
  emailEnabled: false,
  timezone: 'UTC',
  preferredHour: 8
};

function mockAllEnabledConfig() {
  (configService.getBoolean as jest.Mock).mockImplementation((key: string) => {
    const defaults: Record<string, boolean> = {
      NOTIFICATIONS_ENABLED: true,
      NOTIFICATION_DAILY_DIGEST_ENABLED: true,
      NOTIFICATION_WEEKLY_DIGEST_ENABLED: true,
      NOTIFICATION_IN_APP_ENABLED: true,
      NOTIFICATION_EMAIL_ENABLED: false,
      NOTIFICATION_QUIET_HOURS_ENABLED: false,
      NOTIFICATION_CRITICAL_BYPASS_QUIET_HOURS: true
    };
    return Promise.resolve(defaults[key] ?? false);
  });
  (configService.getNumber as jest.Mock).mockImplementation((key: string) => {
    const defaults: Record<string, number> = {
      NOTIFICATION_QUIET_HOURS_START: 22,
      NOTIFICATION_QUIET_HOURS_END: 7
    };
    return Promise.resolve(defaults[key] ?? 0);
  });
}

describe('Phase 86 — IntelligenceDeliveryService (Delivery Decision Engine)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAllEnabledConfig();
    (entitlementService.canAccessFeature as jest.Mock).mockResolvedValue(true);
    (prisma.aIIntelligencePreference.findUnique as jest.Mock).mockResolvedValue(DEFAULT_PREF_ROW);
    (prisma.aIIntelligencePreference.upsert as jest.Mock).mockResolvedValue({ ...DEFAULT_PREF_ROW, lastNotificationDeliveredAt: new Date() });
    (prisma.notificationDelivery.create as jest.Mock).mockResolvedValue({ id: 'delivery-1' });
    (notificationRateLimitService.checkHourlyLimit as jest.Mock).mockResolvedValue(true);
    (notificationRateLimitService.checkDailyLimit as jest.Mock).mockResolvedValue(true);
    (notificationRateLimitService.checkCriticalDailyLimit as jest.Mock).mockResolvedValue(true);
    (notificationService.createNotification as jest.Mock).mockResolvedValue({ id: 'notif-1' });
  });

  // ===== THE single most important test in this phase =====
  it('NEVER calls generateSnapshot / the LLM from the delivery path, across every scenario below', async () => {
    (aiIntelligenceService.getSnapshot as jest.Mock).mockResolvedValue(makeSnapshot());
    await intelligenceDeliveryService.deliverDailyDigest('user-1');

    (aiIntelligenceService.getSnapshot as jest.Mock).mockResolvedValue(null);
    await intelligenceDeliveryService.deliverDailyDigest('user-1');

    (entitlementService.canAccessFeature as jest.Mock).mockResolvedValue(false);
    await intelligenceDeliveryService.deliverDailyDigest('user-1');

    expect(aiIntelligenceService.generateSnapshot).not.toHaveBeenCalled();
    // And it only ever reads via getSnapshot — read-only.
    expect(aiIntelligenceService.getSnapshot).toHaveBeenCalledWith('user-1', 'DAILY', null);
  });

  it('entitlement denied -> SKIPPED_ENTITLEMENT, soft skip (never throws)', async () => {
    (entitlementService.canAccessFeature as jest.Mock).mockResolvedValue(false);

    const decision = await intelligenceDeliveryService.deliverDailyDigest('user-1');

    expect(decision).toEqual({ shouldDeliver: false, reason: 'SKIPPED_ENTITLEMENT' });
    expect(aiIntelligenceService.getSnapshot).not.toHaveBeenCalled();
  });

  it('NOTIFICATIONS_ENABLED=false -> SKIPPED_DISABLED', async () => {
    (configService.getBoolean as jest.Mock).mockImplementation((key: string) => Promise.resolve(key !== 'NOTIFICATIONS_ENABLED'));

    const decision = await intelligenceDeliveryService.deliverDailyDigest('user-1');

    expect(decision.shouldDeliver).toBe(false);
    expect(decision.reason).toBe('SKIPPED_DISABLED');
  });

  it('user has dailyEnabled=false in their AIIntelligencePreference -> SKIPPED_DISABLED', async () => {
    (prisma.aIIntelligencePreference.findUnique as jest.Mock).mockResolvedValue({ ...DEFAULT_PREF_ROW, dailyEnabled: false });

    const decision = await intelligenceDeliveryService.deliverDailyDigest('user-1');

    expect(decision.reason).toBe('SKIPPED_DISABLED');
  });

  it('user has both inAppEnabled and emailEnabled false -> SKIPPED_DISABLED', async () => {
    (prisma.aIIntelligencePreference.findUnique as jest.Mock).mockResolvedValue({
      ...DEFAULT_PREF_ROW,
      inAppEnabled: false,
      emailEnabled: false
    });

    const decision = await intelligenceDeliveryService.deliverDailyDigest('user-1');

    expect(decision.reason).toBe('SKIPPED_DISABLED');
  });

  it('no READY snapshot for the current period -> SKIPPED_NO_SNAPSHOT (never triggers generation)', async () => {
    (aiIntelligenceService.getSnapshot as jest.Mock).mockResolvedValue(null);

    const decision = await intelligenceDeliveryService.deliverDailyDigest('user-1');

    expect(decision).toEqual({ shouldDeliver: false, reason: 'SKIPPED_NO_SNAPSHOT' });
  });

  it('rate limited (hourly) -> SKIPPED_RATE_LIMITED', async () => {
    (aiIntelligenceService.getSnapshot as jest.Mock).mockResolvedValue(makeSnapshot());
    (notificationRateLimitService.checkHourlyLimit as jest.Mock).mockResolvedValue(false);

    const decision = await intelligenceDeliveryService.deliverDailyDigest('user-1');

    expect(decision.reason).toBe('SKIPPED_RATE_LIMITED');
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  it('rate limited (daily) -> SKIPPED_RATE_LIMITED', async () => {
    (aiIntelligenceService.getSnapshot as jest.Mock).mockResolvedValue(makeSnapshot());
    (notificationRateLimitService.checkDailyLimit as jest.Mock).mockResolvedValue(false);

    const decision = await intelligenceDeliveryService.deliverDailyDigest('user-1');

    expect(decision.reason).toBe('SKIPPED_RATE_LIMITED');
  });

  it('CRITICAL priority content additionally checks the critical-daily limit, and denies on it', async () => {
    (aiIntelligenceService.getSnapshot as jest.Mock).mockResolvedValue(
      makeSnapshot({ structuredData: { risks: [{ title: 'Big risk', sourceId: 'r1' }] } })
    );
    (notificationRateLimitService.checkCriticalDailyLimit as jest.Mock).mockResolvedValue(false);

    const decision = await intelligenceDeliveryService.deliverDailyDigest('user-1');

    expect(decision.reason).toBe('SKIPPED_RATE_LIMITED');
    expect(notificationRateLimitService.checkCriticalDailyLimit).toHaveBeenCalledWith('user-1');
  });

  it('duplicate delivery (createNotification throws a P2002-shaped error) -> SKIPPED_DUPLICATE, not an error', async () => {
    (aiIntelligenceService.getSnapshot as jest.Mock).mockResolvedValue(makeSnapshot());
    const p2002 = new Error('Unique constraint failed') as Error & { code: string };
    p2002.code = 'P2002';
    (notificationService.createNotification as jest.Mock).mockRejectedValue(p2002);

    const decision = await intelligenceDeliveryService.deliverDailyDigest('user-1');

    expect(decision).toEqual({ shouldDeliver: false, reason: 'SKIPPED_DUPLICATE' });
  });

  it('happy path: creates the notification, an IN_APP NotificationDelivery row, updates lastNotificationDeliveredAt, and returns DELIVERED', async () => {
    (aiIntelligenceService.getSnapshot as jest.Mock).mockResolvedValue(makeSnapshot());

    const decision = await intelligenceDeliveryService.deliverDailyDigest('user-1');

    expect(decision).toEqual({ shouldDeliver: true, reason: 'DELIVERED', notificationId: 'notif-1' });
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: 'DAILY_INTELLIGENCE',
        snapshotId: 'snap-1',
        projectId: null,
        dedupeKey: expect.stringContaining('notification:v1:user-1:DAILY_INTELLIGENCE:snap-1:')
      })
    );
    expect(prisma.notificationDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ notificationId: 'notif-1', channel: 'IN_APP', status: 'SENT' }) })
    );
    expect(prisma.aIIntelligencePreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } })
    );
    // Email not enqueued — emailEnabled is false on DEFAULT_PREF_ROW.
    expect(rabbitmq.publishToQueue).not.toHaveBeenCalled();
  });

  it('when emailEnabled=true, also creates a PENDING EMAIL NotificationDelivery row and enqueues NOTIFICATION_EMAIL', async () => {
    (prisma.aIIntelligencePreference.findUnique as jest.Mock).mockResolvedValue({ ...DEFAULT_PREF_ROW, emailEnabled: true });
    (configService.getBoolean as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === 'NOTIFICATION_QUIET_HOURS_ENABLED' ? false : true)
    );
    (aiIntelligenceService.getSnapshot as jest.Mock).mockResolvedValue(makeSnapshot());

    const decision = await intelligenceDeliveryService.deliverDailyDigest('user-1');

    expect(decision.shouldDeliver).toBe(true);
    expect(prisma.notificationDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ channel: 'EMAIL', status: 'PENDING' }) })
    );
    expect(rabbitmq.publishToQueue).toHaveBeenCalledWith(
      'notification-email',
      expect.objectContaining({ jobType: 'NOTIFICATION_EMAIL', notificationId: 'notif-1' })
    );
  });

  it('weekly digest calls getSnapshot with WEEKLY and creates a WEEKLY_INTELLIGENCE notification', async () => {
    (aiIntelligenceService.getSnapshot as jest.Mock).mockResolvedValue(makeSnapshot({ type: 'WEEKLY' }));

    const decision = await intelligenceDeliveryService.deliverWeeklyDigest('user-1');

    expect(aiIntelligenceService.getSnapshot).toHaveBeenCalledWith('user-1', 'WEEKLY', null);
    expect(decision.shouldDeliver).toBe(true);
    expect(notificationService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'WEEKLY_INTELLIGENCE' })
    );
    expect(aiIntelligenceService.generateSnapshot).not.toHaveBeenCalled();
  });

  describe('quiet hours', () => {
    it('NORMAL priority content within quiet hours -> SKIPPED_QUIET_HOURS with a deferredUntil ISO timestamp', async () => {
      (configService.getBoolean as jest.Mock).mockImplementation((key: string) => {
        if (key === 'NOTIFICATION_QUIET_HOURS_ENABLED') return Promise.resolve(true);
        if (key === 'NOTIFICATION_CRITICAL_BYPASS_QUIET_HOURS') return Promise.resolve(true);
        return Promise.resolve(true);
      });
      // Use a timezone/hour combination guaranteed to be "quiet": UTC now, quiet window covers
      // the entire day (start=0, end=24 wraps to same-day 0..24 is invalid — use start=0,end=23
      // covering all but hour 23; instead force via a wide window that includes the current UTC hour).
      const nowHour = new Date().getUTCHours();
      (configService.getNumber as jest.Mock).mockImplementation((key: string) => {
        if (key === 'NOTIFICATION_QUIET_HOURS_START') return Promise.resolve(nowHour);
        if (key === 'NOTIFICATION_QUIET_HOURS_END') return Promise.resolve((nowHour + 1) % 24);
        return Promise.resolve(0);
      });
      (aiIntelligenceService.getSnapshot as jest.Mock).mockResolvedValue(makeSnapshot()); // NORMAL priority (no risks/overdue)

      const decision = await intelligenceDeliveryService.deliverDailyDigest('user-1');

      expect(decision.shouldDeliver).toBe(false);
      expect(decision.reason).toBe('SKIPPED_QUIET_HOURS');
      expect(decision.deferredUntil).toEqual(expect.any(String));
      expect(new Date(decision.deferredUntil as string).toString()).not.toBe('Invalid Date');
      expect(notificationService.createNotification).not.toHaveBeenCalled();
    });

    it('CRITICAL priority content bypasses quiet hours when NOTIFICATION_CRITICAL_BYPASS_QUIET_HOURS=true', async () => {
      const nowHour = new Date().getUTCHours();
      (configService.getBoolean as jest.Mock).mockImplementation((key: string) => {
        if (key === 'NOTIFICATION_QUIET_HOURS_ENABLED') return Promise.resolve(true);
        if (key === 'NOTIFICATION_CRITICAL_BYPASS_QUIET_HOURS') return Promise.resolve(true);
        return Promise.resolve(true);
      });
      (configService.getNumber as jest.Mock).mockImplementation((key: string) => {
        if (key === 'NOTIFICATION_QUIET_HOURS_START') return Promise.resolve(nowHour);
        if (key === 'NOTIFICATION_QUIET_HOURS_END') return Promise.resolve((nowHour + 1) % 24);
        return Promise.resolve(0);
      });
      (aiIntelligenceService.getSnapshot as jest.Mock).mockResolvedValue(
        makeSnapshot({ structuredData: { risks: [{ title: 'Outage risk', sourceId: 'r1' }] } }) // -> CRITICAL
      );

      const decision = await intelligenceDeliveryService.deliverDailyDigest('user-1');

      expect(decision.shouldDeliver).toBe(true);
      expect(decision.reason).toBe('DELIVERED');
    });

    it('CRITICAL priority content is still deferred when NOTIFICATION_CRITICAL_BYPASS_QUIET_HOURS=false', async () => {
      const nowHour = new Date().getUTCHours();
      (configService.getBoolean as jest.Mock).mockImplementation((key: string) => {
        if (key === 'NOTIFICATION_QUIET_HOURS_ENABLED') return Promise.resolve(true);
        if (key === 'NOTIFICATION_CRITICAL_BYPASS_QUIET_HOURS') return Promise.resolve(false);
        return Promise.resolve(true);
      });
      (configService.getNumber as jest.Mock).mockImplementation((key: string) => {
        if (key === 'NOTIFICATION_QUIET_HOURS_START') return Promise.resolve(nowHour);
        if (key === 'NOTIFICATION_QUIET_HOURS_END') return Promise.resolve((nowHour + 1) % 24);
        return Promise.resolve(0);
      });
      (aiIntelligenceService.getSnapshot as jest.Mock).mockResolvedValue(
        makeSnapshot({ structuredData: { risks: [{ title: 'Outage risk', sourceId: 'r1' }] } })
      );

      const decision = await intelligenceDeliveryService.deliverDailyDigest('user-1');

      expect(decision.reason).toBe('SKIPPED_QUIET_HOURS');
    });
  });

  describe('priority derivation (server-derived only, never client input)', () => {
    it('CRITICAL when the snapshot has risks/blockers', async () => {
      (aiIntelligenceService.getSnapshot as jest.Mock).mockResolvedValue(
        makeSnapshot({ structuredData: { risks: [{ title: 'R', sourceId: '1' }] } })
      );

      await intelligenceDeliveryService.deliverDailyDigest('user-1');

      expect(notificationService.createNotification).toHaveBeenCalledWith(expect.objectContaining({ priority: 'CRITICAL' }));
    });

    it('HIGH when the snapshot has overdue tasks but no risks', async () => {
      (aiIntelligenceService.getSnapshot as jest.Mock).mockResolvedValue(
        makeSnapshot({ structuredData: { overdueTasks: [{ title: 'T', sourceId: '1' }] } })
      );

      await intelligenceDeliveryService.deliverDailyDigest('user-1');

      expect(notificationService.createNotification).toHaveBeenCalledWith(expect.objectContaining({ priority: 'HIGH' }));
    });

    it('NORMAL when the snapshot has neither risks nor overdue/deadline items', async () => {
      (aiIntelligenceService.getSnapshot as jest.Mock).mockResolvedValue(makeSnapshot({ structuredData: {} }));

      await intelligenceDeliveryService.deliverDailyDigest('user-1');

      expect(notificationService.createNotification).toHaveBeenCalledWith(expect.objectContaining({ priority: 'NORMAL' }));
    });
  });
});
