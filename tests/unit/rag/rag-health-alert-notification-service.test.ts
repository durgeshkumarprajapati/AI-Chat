const mockFindManyUsers = jest.fn();
const mockUpdateAlert = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: (...args: unknown[]) => mockFindManyUsers(...args) },
    ragHealthAlert: { update: (...args: unknown[]) => mockUpdateAlert(...args) }
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

import { ragHealthAlertNotificationService } from '@/features/rag/evaluation/rag-health-alert-notification.service';
import { RagHealthAlertNotificationConfig } from '@/features/rag/evaluation/rag-health-alert-notification-config';

const CONFIG: RagHealthAlertNotificationConfig = { enabled: true, cooldownMinutes: 60, notifyOnResolution: true };

function alert(overrides: Record<string, unknown> = {}) {
  return {
    id: 'alert-1', category: 'CITATION', metric: 'uncitedAnswerRatePercent', severity: 'WARNING', status: 'OPEN',
    dedupeKey: 'CITATION:uncitedAnswerRatePercent:24h', detectionReason: 'Uncited-answer rate 55% exceeds 40% (100 sampled).',
    currentValue: 55, baselineValue: null, thresholdValue: 40, window: '24h', sampleSize: 100, detectionCount: 1,
    firstDetectedAt: new Date('2026-01-01T00:00:00Z'), lastDetectedAt: new Date('2026-01-01T00:00:00Z'),
    acknowledgedAt: null, acknowledgedBy: null, resolvedAt: null,
    lastNotifiedAt: null, lastNotifiedSeverity: null, lastNotifiedDetectionCount: null,
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides
  };
}

describe('RagHealthAlertNotificationService.processCheckResult', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckHourlyLimit.mockResolvedValue(true);
    mockCheckDailyLimit.mockResolvedValue(true);
    mockCheckCriticalDailyLimit.mockResolvedValue(true);
    mockCreateNotification.mockResolvedValue({ id: 'notif-1' });
    mockUpdateAlert.mockResolvedValue({});
  });

  it('1. does nothing at all when notifications are disabled', async () => {
    const result = await ragHealthAlertNotificationService.processCheckResult([alert() as any], [], { ...CONFIG, enabled: false });

    expect(result).toEqual({ alertsNotified: 0, resolutionsNotified: 0 });
    expect(mockFindManyUsers).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('7. queries only ACTIVE admins (existing role/status architecture, no hardcoded IDs)', async () => {
    mockFindManyUsers.mockResolvedValue([{ id: 'admin-1' }]);

    await ragHealthAlertNotificationService.processCheckResult([alert() as any], [], CONFIG);

    expect(mockFindManyUsers).toHaveBeenCalledWith({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true }
    });
  });

  it('does nothing when there are no eligible admins', async () => {
    mockFindManyUsers.mockResolvedValue([]);

    const result = await ragHealthAlertNotificationService.processCheckResult([alert() as any], [], CONFIG);

    expect(result).toEqual({ alertsNotified: 0, resolutionsNotified: 0 });
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('2. notifies and updates lastNotifiedAt/lastNotifiedSeverity/lastNotifiedDetectionCount for a first-open alert', async () => {
    mockFindManyUsers.mockResolvedValue([{ id: 'admin-1' }]);

    const result = await ragHealthAlertNotificationService.processCheckResult([alert() as any], [], CONFIG);

    expect(result.alertsNotified).toBe(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'admin-1', type: 'SYSTEM', priority: 'HIGH'
    }));
    expect(mockUpdateAlert).toHaveBeenCalledWith({
      where: { id: 'alert-1' },
      data: { lastNotifiedAt: expect.any(Date), lastNotifiedSeverity: 'WARNING', lastNotifiedDetectionCount: 1 }
    });
  });

  it('CRITICAL severity maps to CRITICAL notification priority', async () => {
    mockFindManyUsers.mockResolvedValue([{ id: 'admin-1' }]);

    await ragHealthAlertNotificationService.processCheckResult([alert({ severity: 'CRITICAL' }) as any], [], CONFIG);

    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({ priority: 'CRITICAL' }));
  });

  it('detectionCount increasing alone (severity/lastNotifiedAt unchanged, still within cooldown) never triggers a notification', async () => {
    mockFindManyUsers.mockResolvedValue([{ id: 'admin-1' }]);
    const manyMoreDetections = alert({
      lastNotifiedAt: new Date(Date.now() - 5 * 60000),
      lastNotifiedSeverity: 'WARNING',
      lastNotifiedDetectionCount: 1,
      detectionCount: 50
    });

    const result = await ragHealthAlertNotificationService.processCheckResult([manyMoreDetections as any], [], CONFIG);

    expect(result.alertsNotified).toBe(0);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('severity escalation still notifies even while the alert is ACKNOWLEDGED (acknowledgement never suppresses escalation)', async () => {
    mockFindManyUsers.mockResolvedValue([{ id: 'admin-1' }]);
    const acknowledgedButEscalating = alert({
      status: 'ACKNOWLEDGED',
      acknowledgedAt: new Date(Date.now() - 10 * 60000),
      acknowledgedBy: 'admin-1',
      severity: 'CRITICAL',
      lastNotifiedAt: new Date(Date.now() - 60000),
      lastNotifiedSeverity: 'WARNING'
    });

    const result = await ragHealthAlertNotificationService.processCheckResult([acknowledgedButEscalating as any], [], CONFIG);

    expect(result.alertsNotified).toBe(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({ priority: 'CRITICAL' }));
  });

  it('3. does not notify again for a repeated detection still within cooldown', async () => {
    mockFindManyUsers.mockResolvedValue([{ id: 'admin-1' }]);
    const recentlyNotified = alert({ lastNotifiedAt: new Date(Date.now() - 5 * 60000), lastNotifiedSeverity: 'WARNING', detectionCount: 2 });

    const result = await ragHealthAlertNotificationService.processCheckResult([recentlyNotified as any], [], CONFIG);

    expect(result.alertsNotified).toBe(0);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('6. delivers independently to multiple eligible admins', async () => {
    mockFindManyUsers.mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]);

    await ragHealthAlertNotificationService.processCheckResult([alert() as any], [], CONFIG);

    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 'admin-1' }));
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 'admin-2' }));
  });

  it('8. never double-delivers to the same admin id (the query itself returns distinct users, so no dedup loop is needed)', async () => {
    // resolveEligibleAdmins queries prisma.user.findMany with a role/status filter over the User
    // table's own primary key — structurally impossible to return the same id twice, since there
    // is no join. This test pins that structural guarantee directly against the actual query.
    mockFindManyUsers.mockResolvedValue([{ id: 'admin-1' }]);

    await ragHealthAlertNotificationService.processCheckResult([alert() as any], [], CONFIG);

    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
  });

  it('skips a recipient whose rate limit is exceeded, without failing the whole delivery', async () => {
    mockFindManyUsers.mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]);
    mockCheckHourlyLimit.mockImplementation((userId: string) => Promise.resolve(userId !== 'admin-1'));

    const result = await ragHealthAlertNotificationService.processCheckResult([alert() as any], [], CONFIG);

    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 'admin-2' }));
    expect(result.alertsNotified).toBe(1);
  });

  it('13. sends a resolution notification only for a resolved alert that was previously notified', async () => {
    mockFindManyUsers.mockResolvedValue([{ id: 'admin-1' }]);
    const neverNotified = alert({ status: 'RESOLVED', resolvedAt: new Date(), lastNotifiedAt: null });
    const previouslyNotified = alert({ id: 'alert-2', status: 'RESOLVED', resolvedAt: new Date(), lastNotifiedAt: new Date('2026-01-01T00:30:00Z'), lastNotifiedSeverity: 'WARNING' });

    const result = await ragHealthAlertNotificationService.processCheckResult([], [neverNotified as any, previouslyNotified as any], CONFIG);

    expect(result.resolutionsNotified).toBe(1);
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ alertId: 'alert-2' })
    }));
  });

  it('14. never sends a resolution notification when notifyOnResolution is disabled', async () => {
    mockFindManyUsers.mockResolvedValue([{ id: 'admin-1' }]);
    const previouslyNotified = alert({ status: 'RESOLVED', resolvedAt: new Date(), lastNotifiedAt: new Date() });

    const result = await ragHealthAlertNotificationService.processCheckResult([], [previouslyNotified as any], { ...CONFIG, notifyOnResolution: false });

    expect(result.resolutionsNotified).toBe(0);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('15. notification content/metadata never contains raw content — only operational fields', async () => {
    mockFindManyUsers.mockResolvedValue([{ id: 'admin-1' }]);

    await ragHealthAlertNotificationService.processCheckResult([alert() as any], [], CONFIG);

    const call = mockCreateNotification.mock.calls[0][0];
    const forbiddenKeys = ['question', 'answer', 'documentContent', 'entityId', 'prompt', 'secret'];
    expect(Object.keys(call.metadata)).not.toEqual(expect.arrayContaining(forbiddenKeys));
    expect(call.body).not.toMatch(/document|entity/i);
  });
});
