const mockFindMany = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockUpdateMany = jest.fn();
const mockFindUnique = jest.fn();
const mockFindManyDeliveries = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    ragHealthAlert: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args)
    },
    notificationDelivery: {
      findMany: (...args: unknown[]) => mockFindManyDeliveries(...args)
    }
  }
}));

import { ragHealthAlertService } from '@/features/rag/evaluation/rag-health-alert.service';
import { DetectedCondition } from '@/features/rag/evaluation/rag-health-alert-rules';

function condition(overrides: Partial<DetectedCondition> = {}): DetectedCondition {
  return {
    category: 'CITATION', metric: 'uncitedAnswerRatePercent', severity: 'WARNING',
    detectionReason: 'test reason', currentValue: 55, thresholdValue: 40,
    window: '24h', sampleSize: 100, dedupeKey: 'CITATION:uncitedAnswerRatePercent:24h',
    ...overrides
  };
}

describe('RagHealthAlertService.applyDetectedConditions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('10. creates a new alert only once for a repeated identical condition across ticks (deduplication)', async () => {
    // Tick 1: no existing alert.
    mockFindMany.mockResolvedValueOnce([]);
    await ragHealthAlertService.applyDetectedConditions([condition()], ['24h']);
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // Tick 2: the same condition recurs — this time an existing OPEN row is returned.
    mockFindMany.mockResolvedValueOnce([{ id: 'alert-1', dedupeKey: 'CITATION:uncitedAnswerRatePercent:24h', status: 'OPEN' }]);
    await ragHealthAlertService.applyDetectedConditions([condition()], ['24h']);
    expect(mockCreate).toHaveBeenCalledTimes(1); // still only once total
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it('11. a repeated anomaly updates the existing alert (incrementing detectionCount, refreshing currentValue/lastDetectedAt)', async () => {
    mockFindMany.mockResolvedValueOnce([{ id: 'alert-1', dedupeKey: 'CITATION:uncitedAnswerRatePercent:24h', status: 'OPEN' }]);

    await ragHealthAlertService.applyDetectedConditions([condition({ currentValue: 61, severity: 'CRITICAL' })], ['24h']);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'alert-1' },
      data: expect.objectContaining({
        currentValue: 61,
        severity: 'CRITICAL',
        detectionCount: { increment: 1 },
        lastDetectedAt: expect.any(Date)
      })
    });
  });

  it('12. auto-resolves an existing alert once its underlying condition is no longer detected', async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 'alert-1', dedupeKey: 'CITATION:uncitedAnswerRatePercent:24h', status: 'OPEN' },
      { id: 'alert-2', dedupeKey: 'RETRIEVAL:avgRetrievalLatencyMs:24h', status: 'ACKNOWLEDGED' }
    ]);
    mockUpdateMany.mockResolvedValue({ count: 2 });

    // Neither condition detected this tick — both should be resolved.
    const result = await ragHealthAlertService.applyDetectedConditions([], ['24h']);

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['alert-1', 'alert-2'] } },
      data: { status: 'RESOLVED', resolvedAt: expect.any(Date) }
    });
    expect(result.resolved).toBe(2);
  });

  it('only resolves alerts NOT present in the current detection set, leaving still-active ones alone', async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: 'alert-1', dedupeKey: 'CITATION:uncitedAnswerRatePercent:24h', status: 'OPEN' },
      { id: 'alert-2', dedupeKey: 'RETRIEVAL:avgRetrievalLatencyMs:24h', status: 'OPEN' }
    ]);
    mockUpdateMany.mockResolvedValue({ count: 1 });

    // Only the citation condition recurs — the retrieval one should auto-resolve.
    await ragHealthAlertService.applyDetectedConditions([condition()], ['24h']);

    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ['alert-2'] } },
      data: { status: 'RESOLVED', resolvedAt: expect.any(Date) }
    });
  });

  it('never queries or resolves alerts outside the windows actually checked this run', async () => {
    mockFindMany.mockResolvedValueOnce([]);
    await ragHealthAlertService.applyDetectedConditions([], ['1h', '24h']);

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] }, window: { in: ['1h', '24h'] } }
    });
  });
});

describe('RagHealthAlertService.acknowledgeAlert', () => {
  it('transitions an alert to ACKNOWLEDGED with an actor and timestamp', async () => {
    mockUpdate.mockResolvedValue({ id: 'alert-1', status: 'ACKNOWLEDGED' });
    const result = await ragHealthAlertService.acknowledgeAlert('alert-1', 'admin-user-1');

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'alert-1' },
      data: { status: 'ACKNOWLEDGED', acknowledgedAt: expect.any(Date), acknowledgedBy: 'admin-user-1' }
    });
    expect(result.status).toBe('ACKNOWLEDGED');
  });
});

describe('RagHealthAlertService.listAlerts', () => {
  it('bounds the query to a maximum of 200 rows regardless of the requested limit', async () => {
    mockFindMany.mockResolvedValue([]);
    await ragHealthAlertService.listAlerts({ limit: 100000 });

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 200 }));
  });

  it('14. selects/returns no question/answer/document-content field (the model has none by design)', async () => {
    mockFindMany.mockResolvedValue([{ id: 'a1', category: 'CITATION', metric: 'x', currentValue: 1 }]);
    const alerts = await ragHealthAlertService.listAlerts({});
    for (const alert of alerts) {
      expect(Object.keys(alert)).not.toEqual(expect.arrayContaining(['question', 'answer', 'documentContent']));
    }
  });

  it('severity filtering: passed through to the where clause only when provided', async () => {
    mockFindMany.mockResolvedValue([]);
    await ragHealthAlertService.listAlerts({ severity: 'CRITICAL' });

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ severity: 'CRITICAL' })
    }));
  });

  it('time-range filtering: `since` is applied against the already-indexed lastDetectedAt column', async () => {
    mockFindMany.mockResolvedValue([]);
    const since = new Date('2026-01-01T00:00:00Z');
    await ragHealthAlertService.listAlerts({ since });

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ lastDetectedAt: { gte: since } })
    }));
  });

  it('omitting severity/since leaves the where clause unchanged from before this extension', async () => {
    mockFindMany.mockResolvedValue([]);
    await ragHealthAlertService.listAlerts({ status: 'OPEN' });

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'OPEN' }
    }));
  });
});

describe('RagHealthAlertService.getAlertById', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFindManyDeliveries.mockResolvedValue([]);
  });

  it('returns the enriched alert for an existing id', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'a1', status: 'OPEN', firstDetectedAt: new Date(), resolvedAt: null,
      lastNotifiedAt: null, lastExternalNotifiedAt: null, escalatedAt: null
    });

    const result = await ragHealthAlertService.getAlertById('a1');

    expect(result).not.toBeNull();
    expect(result?.id).toBe('a1');
    expect(result?.notificationStatus).toBe('NOT_NOTIFIED');
    expect(result?.externalNotificationStatus).toBe('NOT_NOTIFIED');
    expect(result?.escalationStatus).toBe('NOT_ESCALATED');
  });

  it('returns null (not a throw) for a missing id, so callers can fail safely', async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await ragHealthAlertService.getAlertById('does-not-exist');

    expect(result).toBeNull();
    expect(mockFindManyDeliveries).not.toHaveBeenCalled();
  });

  it('reports NOTIFIED/ESCALATED status once the corresponding timestamps are set', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'a1', status: 'OPEN', firstDetectedAt: new Date(), resolvedAt: null,
      lastNotifiedAt: new Date(), lastExternalNotifiedAt: new Date(), escalatedAt: new Date()
    });

    const result = await ragHealthAlertService.getAlertById('a1');

    expect(result?.externalNotificationStatus).toBe('NOTIFIED');
    expect(result?.escalationStatus).toBe('ESCALATED');
  });

  it('enriches with a bounded, anonymized externalDeliveries breakdown scoped to this one alert (no recipient identity)', async () => {
    mockFindUnique.mockResolvedValue({ id: 'a1', status: 'OPEN', firstDetectedAt: new Date(), resolvedAt: null, lastNotifiedAt: new Date() });
    mockFindManyDeliveries.mockResolvedValue([
      { status: 'SENT', attemptCount: 1, lastAttemptAt: new Date(), failureReason: null },
      { status: 'FAILED', attemptCount: 3, lastAttemptAt: new Date(), failureReason: 'Email provider not configured' }
    ]);

    const result = await ragHealthAlertService.getAlertById('a1');

    expect(mockFindManyDeliveries).toHaveBeenCalledWith({
      where: { channel: 'EMAIL', notification: { metadata: { path: ['alertId'], equals: 'a1' } } },
      select: { status: true, attemptCount: true, lastAttemptAt: true, failureReason: true }
    });
    expect(result?.externalDeliveries).toHaveLength(2);
    for (const delivery of result?.externalDeliveries ?? []) {
      expect(Object.keys(delivery)).not.toEqual(expect.arrayContaining(['email', 'userId', 'name']));
    }
  });

  it('degrades to an empty externalDeliveries array (never throws) if the delivery query fails', async () => {
    mockFindUnique.mockResolvedValue({ id: 'a1', status: 'OPEN', firstDetectedAt: new Date(), resolvedAt: null, lastNotifiedAt: null });
    mockFindManyDeliveries.mockRejectedValue(new Error('DB unavailable'));
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const result = await ragHealthAlertService.getAlertById('a1');

    expect(result?.externalDeliveries).toEqual([]);
    consoleErrorSpy.mockRestore();
  });
});
