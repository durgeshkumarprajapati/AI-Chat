jest.mock('@/lib/auth', () => ({
  requireAuthenticatedUser: jest.fn(),
  requireRole: jest.fn((user, role) => {
    if (user.role !== role) {
      const { AuthorizationError } = require('@/errors');
      throw new AuthorizationError('Administrator privileges are required.');
    }
  })
}));

const mockListAlerts = jest.fn();
const mockAcknowledgeAlert = jest.fn();
const mockGetAlertById = jest.fn();
jest.mock('@/features/rag/evaluation/rag-health-alert.service', () => ({
  ragHealthAlertService: {
    listAlerts: (...args: unknown[]) => mockListAlerts(...args),
    acknowledgeAlert: (...args: unknown[]) => mockAcknowledgeAlert(...args),
    getAlertById: (...args: unknown[]) => mockGetAlertById(...args)
  }
}));

const mockFindUnique = jest.fn();
jest.mock('@/lib/prisma', () => ({
  prisma: { ragHealthAlert: { findUnique: (...args: unknown[]) => mockFindUnique(...args) } }
}));

// rag-health.service.ts pulls in the real telemetry-aggregation/config/redis/env chain at import
// time (same class of import-time coupling seen with the notification service in the check-service
// test) — mocked here to keep this route test isolated, using the SAME real WINDOW_MS values so
// the time-range assertions below still reflect real behavior.
jest.mock('@/features/rag/evaluation/rag-health.service', () => ({
  isRagHealthTimeWindow: (value: unknown) => value === '1h' || value === '24h' || value === '7d' || value === '30d',
  WINDOW_MS: { '1h': 3600000, '24h': 86400000, '7d': 604800000, '30d': 2592000000 }
}));

import { NextRequest } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { GET } from '@/app/api/admin/rag-health-alerts/route';
import { GET as getById } from '@/app/api/admin/rag-health-alerts/[id]/route';
import { POST as acknowledge } from '@/app/api/admin/rag-health-alerts/[id]/acknowledge/route';

describe('/api/admin/rag-health-alerts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('13. rejects a non-admin caller with 403 (existing admin authorization pattern, unmodified)', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'u1', role: 'USER' });

    const res = await GET(new NextRequest('http://localhost:3000/api/admin/rag-health-alerts'));

    expect(res.status).toBe(403);
    expect(mockListAlerts).not.toHaveBeenCalled();
  });

  it('lists alerts for an admin caller, passing through status/category/limit query params', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });
    mockListAlerts.mockResolvedValue([{ id: 'a1', category: 'CITATION', status: 'OPEN' }]);

    const res = await GET(new NextRequest('http://localhost:3000/api/admin/rag-health-alerts?status=OPEN&category=CITATION&limit=10'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.count).toBe(1);
    expect(mockListAlerts).toHaveBeenCalledWith({ status: 'OPEN', category: 'CITATION', limit: 10 });
  });

  it('ignores an invalid status query param rather than erroring', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });
    mockListAlerts.mockResolvedValue([]);

    const res = await GET(new NextRequest('http://localhost:3000/api/admin/rag-health-alerts?status=NOT_A_REAL_STATUS'));

    expect(res.status).toBe(200);
    expect(mockListAlerts).toHaveBeenCalledWith({ status: undefined, category: undefined, limit: undefined });
  });

  it('14. never returns a question/answer/document field (the model carries none)', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });
    mockListAlerts.mockResolvedValue([{ id: 'a1', category: 'CITATION', metric: 'x', currentValue: 55, detectionReason: 'ok' }]);

    const res = await GET(new NextRequest('http://localhost:3000/api/admin/rag-health-alerts'));
    const body = await res.json();

    for (const alert of body.data.alerts) {
      expect(Object.keys(alert)).not.toEqual(expect.arrayContaining(['question', 'answer', 'documentContent']));
    }
  });

  it('severity filtering: passes a valid severity through, ignores an invalid one', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });
    mockListAlerts.mockResolvedValue([]);

    await GET(new NextRequest('http://localhost:3000/api/admin/rag-health-alerts?severity=CRITICAL'));
    expect(mockListAlerts).toHaveBeenCalledWith(expect.objectContaining({ severity: 'CRITICAL' }));

    mockListAlerts.mockClear();
    await GET(new NextRequest('http://localhost:3000/api/admin/rag-health-alerts?severity=NOT_REAL'));
    expect(mockListAlerts).toHaveBeenCalledWith(expect.objectContaining({ severity: undefined }));
  });

  it('category filtering: passes a valid category through, ignores an invalid one (validated against the real enum, not accepted as an arbitrary string)', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });
    mockListAlerts.mockResolvedValue([]);

    await GET(new NextRequest('http://localhost:3000/api/admin/rag-health-alerts?category=GRAPH'));
    expect(mockListAlerts).toHaveBeenCalledWith(expect.objectContaining({ category: 'GRAPH' }));

    mockListAlerts.mockClear();
    await GET(new NextRequest('http://localhost:3000/api/admin/rag-health-alerts?category=NOT_A_REAL_CATEGORY'));
    expect(mockListAlerts).toHaveBeenCalledWith(expect.objectContaining({ category: undefined }));
  });

  it('time-range filtering: a valid timeRange computes a `since` Date; an invalid one is ignored', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });
    mockListAlerts.mockResolvedValue([]);

    await GET(new NextRequest('http://localhost:3000/api/admin/rag-health-alerts?timeRange=24h'));
    expect(mockListAlerts).toHaveBeenCalledWith(expect.objectContaining({ since: expect.any(Date) }));

    mockListAlerts.mockClear();
    await GET(new NextRequest('http://localhost:3000/api/admin/rag-health-alerts?timeRange=45minutes'));
    expect(mockListAlerts).toHaveBeenCalledWith(expect.objectContaining({ since: undefined }));
  });

  it('omitting every new filter param leaves listAlerts called with them undefined (backward compatible)', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });
    mockListAlerts.mockResolvedValue([]);

    await GET(new NextRequest('http://localhost:3000/api/admin/rag-health-alerts'));

    expect(mockListAlerts).toHaveBeenCalledWith({ status: undefined, category: undefined, severity: undefined, since: undefined, limit: undefined });
  });
});

describe('/api/admin/rag-health-alerts/[id] (notification deep-link lookup)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a non-admin caller with 403', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'u1', role: 'USER' });

    const res = await getById(new NextRequest('http://localhost:3000/api/admin/rag-health-alerts/a1'), { params: { id: 'a1' } });

    expect(res.status).toBe(403);
    expect(mockGetAlertById).not.toHaveBeenCalled();
  });

  it('a valid alertId resolves to the correct alert', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });
    mockGetAlertById.mockResolvedValue({ id: 'a1', category: 'CITATION', status: 'OPEN' });

    const res = await getById(new NextRequest('http://localhost:3000/api/admin/rag-health-alerts/a1'), { params: { id: 'a1' } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.id).toBe('a1');
    expect(mockGetAlertById).toHaveBeenCalledWith('a1');
  });

  it('a missing/invalid alertId fails safely with 404, not a crash', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });
    mockGetAlertById.mockResolvedValue(null);

    const res = await getById(new NextRequest('http://localhost:3000/api/admin/rag-health-alerts/does-not-exist'), { params: { id: 'does-not-exist' } });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });
});

describe('/api/admin/rag-health-alerts/[id]/acknowledge', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a non-admin caller with 403', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'u1', role: 'USER' });

    const res = await acknowledge(new NextRequest('http://localhost:3000/api/admin/rag-health-alerts/a1/acknowledge', { method: 'POST' }), { params: { id: 'a1' } });

    expect(res.status).toBe(403);
    expect(mockAcknowledgeAlert).not.toHaveBeenCalled();
  });

  it('returns 404 for a non-existent alert', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });
    mockFindUnique.mockResolvedValue(null);

    const res = await acknowledge(new NextRequest('http://localhost:3000/api/admin/rag-health-alerts/missing/acknowledge', { method: 'POST' }), { params: { id: 'missing' } });

    expect(res.status).toBe(404);
    expect(mockAcknowledgeAlert).not.toHaveBeenCalled();
  });

  it('acknowledges an existing alert as the calling admin', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });
    mockFindUnique.mockResolvedValue({ id: 'a1', status: 'OPEN' });
    mockAcknowledgeAlert.mockResolvedValue({ id: 'a1', status: 'ACKNOWLEDGED' });

    const res = await acknowledge(new NextRequest('http://localhost:3000/api/admin/rag-health-alerts/a1/acknowledge', { method: 'POST' }), { params: { id: 'a1' } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.status).toBe('ACKNOWLEDGED');
    expect(mockAcknowledgeAlert).toHaveBeenCalledWith('a1', 'admin-1');
  });
});
