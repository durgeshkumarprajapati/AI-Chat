const mockFindManyUsers = jest.fn();
const mockUpdateAlert = jest.fn();
const mockCreateDelivery = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: (...args: unknown[]) => mockFindManyUsers(...args) },
    ragHealthAlert: { update: (...args: unknown[]) => mockUpdateAlert(...args) },
    notificationDelivery: { create: (...args: unknown[]) => mockCreateDelivery(...args) }
  }
}));

const mockCreateNotification = jest.fn();
jest.mock('@/features/notifications/notification.service', () => ({
  notificationService: { createNotification: (...args: unknown[]) => mockCreateNotification(...args) }
}));

const mockCheckHourlyLimit = jest.fn();
const mockCheckDailyLimit = jest.fn();
const mockCheckCriticalDailyLimit = jest.fn();
jest.mock('@/features/notifications/notification-rate-limit.service', () => ({
  notificationRateLimitService: {
    checkHourlyLimit: (...args: unknown[]) => mockCheckHourlyLimit(...args),
    checkDailyLimit: (...args: unknown[]) => mockCheckDailyLimit(...args),
    checkCriticalDailyLimit: (...args: unknown[]) => mockCheckCriticalDailyLimit(...args)
  }
}));

const mockPublishToQueue = jest.fn();
jest.mock('@/lib/rabbitmq', () => ({
  rabbitmq: { publishToQueue: (...args: unknown[]) => mockPublishToQueue(...args) },
  QUEUES: { NOTIFICATION_EMAIL: 'notification-email' }
}));

import { ragHealthAlertNotificationService } from '@/features/rag/evaluation/rag-health-alert-notification.service';
import { RagHealthAlertNotificationConfig } from '@/features/rag/evaluation/rag-health-alert-notification-config';
import { RagHealthAlertExternalDeliveryConfig } from '@/features/rag/evaluation/rag-health-alert-external-delivery-config';

const CONFIG: RagHealthAlertNotificationConfig = { enabled: true, cooldownMinutes: 60, notifyOnResolution: true };
const EXTERNAL_OFF: RagHealthAlertExternalDeliveryConfig = {
  externalEnabled: false, externalCooldownMinutes: 120, externalNotifyOnResolution: true,
  escalationEnabled: false, escalationDelayMinutes: 30, escalationCooldownMinutes: 60
};
const EXTERNAL_ON: RagHealthAlertExternalDeliveryConfig = { ...EXTERNAL_OFF, externalEnabled: true };

function alert(overrides: Record<string, unknown> = {}) {
  return {
    id: 'alert-1', category: 'CITATION', metric: 'uncitedAnswerRatePercent', severity: 'WARNING', status: 'OPEN',
    dedupeKey: 'CITATION:uncitedAnswerRatePercent:24h', detectionReason: 'Uncited-answer rate 55% exceeds 40% (100 sampled).',
    currentValue: 55, baselineValue: null, thresholdValue: 40, window: '24h', sampleSize: 100, detectionCount: 1,
    firstDetectedAt: new Date('2026-01-01T00:00:00Z'), lastDetectedAt: new Date('2026-01-01T00:00:00Z'),
    acknowledgedAt: null, acknowledgedBy: null, resolvedAt: null,
    lastNotifiedAt: null, lastNotifiedSeverity: null, lastNotifiedDetectionCount: null,
    lastExternalNotifiedAt: null, lastExternalNotifiedSeverity: null, escalatedAt: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides
  };
}

describe('RagHealthAlertNotificationService.processCheckResult — in-app (regression, unchanged behavior)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckHourlyLimit.mockResolvedValue(true);
    mockCheckDailyLimit.mockResolvedValue(true);
    mockCheckCriticalDailyLimit.mockResolvedValue(true);
    mockCreateNotification.mockResolvedValue({ id: 'notif-1' });
    mockUpdateAlert.mockResolvedValue({});
    mockCreateDelivery.mockResolvedValue({});
    mockPublishToQueue.mockResolvedValue(undefined);
  });

  it('1. does nothing at all when notifications are disabled', async () => {
    const result = await ragHealthAlertNotificationService.processCheckResult([alert() as any], [], { ...CONFIG, enabled: false }, EXTERNAL_OFF);

    expect(result).toEqual({ alertsNotified: 0, resolutionsNotified: 0, escalationsSent: 0 });
    expect(mockFindManyUsers).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('7. queries only ACTIVE admins (existing role/status architecture, no hardcoded IDs)', async () => {
    mockFindManyUsers.mockResolvedValue([{ id: 'admin-1' }]);

    await ragHealthAlertNotificationService.processCheckResult([alert() as any], [], CONFIG, EXTERNAL_OFF);

    expect(mockFindManyUsers).toHaveBeenCalledWith({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true }
    });
  });

  it('does nothing when there are no eligible admins', async () => {
    mockFindManyUsers.mockResolvedValue([]);

    const result = await ragHealthAlertNotificationService.processCheckResult([alert() as any], [], CONFIG, EXTERNAL_OFF);

    expect(result).toEqual({ alertsNotified: 0, resolutionsNotified: 0, escalationsSent: 0 });
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('2. notifies and updates lastNotifiedAt/lastNotifiedSeverity/lastNotifiedDetectionCount for a first-open alert', async () => {
    mockFindManyUsers.mockResolvedValue([{ id: 'admin-1' }]);

    const result = await ragHealthAlertNotificationService.processCheckResult([alert() as any], [], CONFIG, EXTERNAL_OFF);

    expect(result.alertsNotified).toBe(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'admin-1', type: 'SYSTEM', priority: 'HIGH'
    }));
    expect(mockUpdateAlert).toHaveBeenCalledWith({
      where: { id: 'alert-1' },
      data: { lastNotifiedAt: expect.any(Date), lastNotifiedSeverity: 'WARNING', lastNotifiedDetectionCount: 1 }
    });
    // External disabled — never touches the email pipeline.
    expect(mockCreateDelivery).not.toHaveBeenCalled();
    expect(mockPublishToQueue).not.toHaveBeenCalled();
  });

  it('3. does not notify again for a repeated detection still within cooldown', async () => {
    mockFindManyUsers.mockResolvedValue([{ id: 'admin-1' }]);
    const recentlyNotified = alert({ lastNotifiedAt: new Date(Date.now() - 5 * 60000), lastNotifiedSeverity: 'WARNING', detectionCount: 2 });

    const result = await ragHealthAlertNotificationService.processCheckResult([recentlyNotified as any], [], CONFIG, EXTERNAL_OFF);

    expect(result.alertsNotified).toBe(0);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('6. delivers independently to multiple eligible admins', async () => {
    mockFindManyUsers.mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]);

    await ragHealthAlertNotificationService.processCheckResult([alert() as any], [], CONFIG, EXTERNAL_OFF);

    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
  });

  it('13. sends a resolution notification only for a resolved alert that was previously notified', async () => {
    mockFindManyUsers.mockResolvedValue([{ id: 'admin-1' }]);
    const neverNotified = alert({ status: 'RESOLVED', resolvedAt: new Date(), lastNotifiedAt: null });
    const previouslyNotified = alert({ id: 'alert-2', status: 'RESOLVED', resolvedAt: new Date(), lastNotifiedAt: new Date('2026-01-01T00:30:00Z'), lastNotifiedSeverity: 'WARNING' });

    const result = await ragHealthAlertNotificationService.processCheckResult([], [neverNotified as any, previouslyNotified as any], CONFIG, EXTERNAL_OFF);

    expect(result.resolutionsNotified).toBe(1);
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
  });

  it('14. never sends a resolution notification when notifyOnResolution is disabled', async () => {
    mockFindManyUsers.mockResolvedValue([{ id: 'admin-1' }]);
    const previouslyNotified = alert({ status: 'RESOLVED', resolvedAt: new Date(), lastNotifiedAt: new Date() });

    const result = await ragHealthAlertNotificationService.processCheckResult([], [previouslyNotified as any], { ...CONFIG, notifyOnResolution: false }, EXTERNAL_OFF);

    expect(result.resolutionsNotified).toBe(0);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('15. notification content/metadata never contains raw content — only operational fields', async () => {
    mockFindManyUsers.mockResolvedValue([{ id: 'admin-1' }]);

    await ragHealthAlertNotificationService.processCheckResult([alert() as any], [], CONFIG, EXTERNAL_OFF);

    const call = mockCreateNotification.mock.calls[0][0];
    const forbiddenKeys = ['question', 'answer', 'documentContent', 'entityId', 'prompt', 'secret'];
    expect(Object.keys(call.metadata)).not.toEqual(expect.arrayContaining(forbiddenKeys));
    expect(call.body).not.toMatch(/document|entity/i);
  });
});

describe('RagHealthAlertNotificationService.processCheckResult — external (email) delivery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckHourlyLimit.mockResolvedValue(true);
    mockCheckDailyLimit.mockResolvedValue(true);
    mockCheckCriticalDailyLimit.mockResolvedValue(true);
    mockCreateNotification.mockResolvedValue({ id: 'notif-1' });
    mockUpdateAlert.mockResolvedValue({});
    mockCreateDelivery.mockResolvedValue({});
    mockPublishToQueue.mockResolvedValue(undefined);
    mockFindManyUsers.mockResolvedValue([{ id: 'admin-1' }]);
  });

  it('feature disabled → no external delivery at all', async () => {
    await ragHealthAlertNotificationService.processCheckResult([alert() as any], [], CONFIG, EXTERNAL_OFF);

    expect(mockCreateDelivery).not.toHaveBeenCalled();
    expect(mockPublishToQueue).not.toHaveBeenCalled();
  });

  it('first CRITICAL alert → external delivery attempted (EMAIL NotificationDelivery created + queue publish)', async () => {
    const result = await ragHealthAlertNotificationService.processCheckResult([alert({ severity: 'CRITICAL' }) as any], [], CONFIG, EXTERNAL_ON);

    expect(mockCreateDelivery).toHaveBeenCalledWith({
      data: { notificationId: 'notif-1', channel: 'EMAIL', status: 'PENDING' }
    });
    expect(mockPublishToQueue).toHaveBeenCalledWith('notification-email', expect.objectContaining({
      jobType: 'NOTIFICATION_EMAIL', notificationId: 'notif-1', attempt: 1
    }));
    expect(mockUpdateAlert).toHaveBeenCalledWith({
      where: { id: 'alert-1' },
      data: expect.objectContaining({ lastExternalNotifiedAt: expect.any(Date), lastExternalNotifiedSeverity: 'CRITICAL' })
    });
    expect(result.alertsNotified).toBe(1);
  });

  it('repeated detection within the EXTERNAL cooldown → no duplicate external delivery, even though in-app already fired once before', async () => {
    // In-app already due again (its own 60-min cooldown elapsed), but external's independent
    // 120-min cooldown has not — external must stay silent while in-app still fires.
    const a = alert({
      lastNotifiedAt: new Date(Date.now() - 61 * 60000), lastNotifiedSeverity: 'WARNING',
      lastExternalNotifiedAt: new Date(Date.now() - 30 * 60000), lastExternalNotifiedSeverity: 'WARNING'
    });

    const result = await ragHealthAlertNotificationService.processCheckResult([a as any], [], CONFIG, EXTERNAL_ON);

    expect(result.alertsNotified).toBe(1); // in-app still fires
    expect(mockCreateDelivery).not.toHaveBeenCalled(); // external does not
  });

  it('external cooldown expiration → external delivery allowed again', async () => {
    const a = alert({
      lastNotifiedAt: new Date(Date.now() - 61 * 60000), lastNotifiedSeverity: 'WARNING',
      lastExternalNotifiedAt: new Date(Date.now() - 121 * 60000), lastExternalNotifiedSeverity: 'WARNING'
    });

    await ragHealthAlertNotificationService.processCheckResult([a as any], [], CONFIG, EXTERNAL_ON);

    expect(mockCreateDelivery).toHaveBeenCalledTimes(1);
  });

  it('severity escalation → immediate external delivery, bypassing external\'s own cooldown', async () => {
    const a = alert({
      severity: 'CRITICAL',
      lastNotifiedAt: new Date(Date.now() - 60000), lastNotifiedSeverity: 'WARNING',
      lastExternalNotifiedAt: new Date(Date.now() - 60000), lastExternalNotifiedSeverity: 'WARNING'
    });

    await ragHealthAlertNotificationService.processCheckResult([a as any], [], CONFIG, EXTERNAL_ON);

    expect(mockCreateDelivery).toHaveBeenCalledTimes(1);
  });

  it('detection count increase alone never triggers external delivery', async () => {
    const a = alert({
      lastNotifiedAt: new Date(Date.now() - 5 * 60000), lastNotifiedSeverity: 'WARNING',
      lastExternalNotifiedAt: new Date(Date.now() - 5 * 60000), lastExternalNotifiedSeverity: 'WARNING',
      detectionCount: 99
    });

    const result = await ragHealthAlertNotificationService.processCheckResult([a as any], [], CONFIG, EXTERNAL_ON);

    expect(result.alertsNotified).toBe(0);
    expect(mockCreateDelivery).not.toHaveBeenCalled();
  });

  it('a NotificationDelivery/queue failure does not break alert persistence or the in-app notification that already succeeded', async () => {
    mockPublishToQueue.mockRejectedValue(new Error('RabbitMQ unavailable'));

    const result = await ragHealthAlertNotificationService.processCheckResult([alert({ severity: 'CRITICAL' }) as any], [], CONFIG, EXTERNAL_ON);

    expect(result.alertsNotified).toBe(1); // in-app unaffected
    expect(mockUpdateAlert).toHaveBeenCalledWith({
      where: { id: 'alert-1' },
      data: expect.not.objectContaining({ lastExternalNotifiedAt: expect.anything() })
    });
  });

  it('resolution: external resolution notification only when the alert was previously externally notified', async () => {
    const neverExternallyNotified = alert({ status: 'RESOLVED', resolvedAt: new Date(), lastNotifiedAt: new Date(), lastExternalNotifiedAt: null });
    const previouslyExternallyNotified = alert({
      id: 'alert-2', status: 'RESOLVED', resolvedAt: new Date(), lastNotifiedAt: new Date(), lastExternalNotifiedAt: new Date('2026-01-01T00:30:00Z')
    });

    await ragHealthAlertNotificationService.processCheckResult([], [neverExternallyNotified as any, previouslyExternallyNotified as any], CONFIG, EXTERNAL_ON);

    expect(mockCreateDelivery).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledTimes(2); // both still get an in-app resolution row
  });

  it('resolution: external delivery disabled at the resolution-specific flag → no external resolution message', async () => {
    const previouslyExternallyNotified = alert({ status: 'RESOLVED', resolvedAt: new Date(), lastNotifiedAt: new Date(), lastExternalNotifiedAt: new Date() });

    await ragHealthAlertNotificationService.processCheckResult([], [previouslyExternallyNotified as any], CONFIG, { ...EXTERNAL_ON, externalNotifyOnResolution: false });

    expect(mockCreateDelivery).not.toHaveBeenCalled();
  });

  it('resolution content contains no raw RAG data', async () => {
    const previouslyExternallyNotified = alert({ status: 'RESOLVED', resolvedAt: new Date(), lastNotifiedAt: new Date(), lastExternalNotifiedAt: new Date() });

    await ragHealthAlertNotificationService.processCheckResult([], [previouslyExternallyNotified as any], CONFIG, EXTERNAL_ON);

    const call = mockCreateNotification.mock.calls[0][0];
    expect(Object.keys(call.metadata)).not.toEqual(expect.arrayContaining(['question', 'answer', 'documentContent', 'entityId']));
  });
});

describe('RagHealthAlertNotificationService.processCheckResult — acknowledgement-based escalation', () => {
  const ESCALATION_ON: RagHealthAlertExternalDeliveryConfig = { ...EXTERNAL_OFF, escalationEnabled: true, escalationDelayMinutes: 30, escalationCooldownMinutes: 60 };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckHourlyLimit.mockResolvedValue(true);
    mockCheckDailyLimit.mockResolvedValue(true);
    mockCheckCriticalDailyLimit.mockResolvedValue(true);
    mockCreateNotification.mockResolvedValue({ id: 'notif-1' });
    mockUpdateAlert.mockResolvedValue({});
    mockCreateDelivery.mockResolvedValue({});
    mockPublishToQueue.mockResolvedValue(undefined);
    mockFindManyUsers.mockResolvedValue([{ id: 'admin-1' }]);
  });

  it('escalation disabled by default → never escalates even for a long-unacknowledged CRITICAL alert', async () => {
    const overdue = alert({ severity: 'CRITICAL', firstDetectedAt: new Date(Date.now() - 120 * 60000) });

    const result = await ragHealthAlertNotificationService.processCheckResult([overdue as any], [], { ...CONFIG, enabled: false }, EXTERNAL_OFF);

    expect(result.escalationsSent).toBe(0);
  });

  it('an unacknowledged CRITICAL alert escalates after the configured delay', async () => {
    const overdue = alert({ severity: 'CRITICAL', firstDetectedAt: new Date(Date.now() - 31 * 60000) });

    const result = await ragHealthAlertNotificationService.processCheckResult([overdue as any], [], CONFIG, ESCALATION_ON);

    expect(result.escalationsSent).toBe(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/ESCALATION/) }));
    expect(mockUpdateAlert).toHaveBeenCalledWith({
      where: { id: 'alert-1' },
      data: expect.objectContaining({ escalatedAt: expect.any(Date) })
    });
  });

  it('an ACKNOWLEDGED alert never escalates', async () => {
    const acknowledged = alert({ severity: 'CRITICAL', status: 'ACKNOWLEDGED', firstDetectedAt: new Date(Date.now() - 120 * 60000) });

    const result = await ragHealthAlertNotificationService.processCheckResult([acknowledged as any], [], CONFIG, ESCALATION_ON);

    expect(result.escalationsSent).toBe(0);
  });

  it('escalation never changes the alert\'s lifecycle status (the update call never touches `status`)', async () => {
    const overdue = alert({ severity: 'CRITICAL', firstDetectedAt: new Date(Date.now() - 31 * 60000) });

    await ragHealthAlertNotificationService.processCheckResult([overdue as any], [], CONFIG, ESCALATION_ON);

    const updateCall = mockUpdateAlert.mock.calls.find((c) => 'escalatedAt' in c[0].data);
    expect(updateCall[0].data).not.toHaveProperty('status');
    expect(updateCall[0].data).not.toHaveProperty('acknowledgedAt');
  });

  it('does not repeat every scheduler interval — stays silent within the escalation cooldown', async () => {
    const recentlyEscalated = alert({
      severity: 'CRITICAL', firstDetectedAt: new Date(Date.now() - 120 * 60000), escalatedAt: new Date(Date.now() - 10 * 60000)
    });

    const result = await ragHealthAlertNotificationService.processCheckResult([recentlyEscalated as any], [], CONFIG, ESCALATION_ON);

    expect(result.escalationsSent).toBe(0);
  });

  it('escalates again once its own cooldown has elapsed', async () => {
    const staleEscalation = alert({
      severity: 'CRITICAL', firstDetectedAt: new Date(Date.now() - 200 * 60000), escalatedAt: new Date(Date.now() - 61 * 60000)
    });

    const result = await ragHealthAlertNotificationService.processCheckResult([staleEscalation as any], [], CONFIG, ESCALATION_ON);

    expect(result.escalationsSent).toBe(1);
  });

  it('a WARNING alert never escalates, regardless of how long it has been unacknowledged', async () => {
    const overdue = alert({ severity: 'WARNING', firstDetectedAt: new Date(Date.now() - 120 * 60000) });

    const result = await ragHealthAlertNotificationService.processCheckResult([overdue as any], [], CONFIG, ESCALATION_ON);

    expect(result.escalationsSent).toBe(0);
  });

  it('escalation also attempts external delivery when the external channel is enabled', async () => {
    const overdue = alert({ severity: 'CRITICAL', firstDetectedAt: new Date(Date.now() - 31 * 60000) });

    await ragHealthAlertNotificationService.processCheckResult([overdue as any], [], CONFIG, { ...ESCALATION_ON, externalEnabled: true });

    expect(mockCreateDelivery).toHaveBeenCalled();
    expect(mockPublishToQueue).toHaveBeenCalled();
  });
});
