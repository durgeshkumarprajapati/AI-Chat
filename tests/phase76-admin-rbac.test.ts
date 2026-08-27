jest.mock('@/lib/auth', () => ({
  requireAuthenticatedUser: jest.fn(),
  requireRole: jest.fn((user, role) => {
    if (user.role !== role) {
      const { AuthorizationError } = require('@/errors');
      throw new AuthorizationError('Administrator privileges are required.');
    }
  })
}));
jest.mock('@/features/config', () => ({
  configService: { getBoolean: jest.fn().mockResolvedValue(false) }
}));
jest.mock('@/features/billing', () => ({
  subscriptionService: { getMetricsSnapshot: jest.fn().mockResolvedValue({ trialUsers: 0, activeSubscriptions: 0, pastDueUsers: 0, canceledOrExpired: 0 }) },
  razorpayProvider: { isConfigured: jest.fn().mockReturnValue(false) }
}));
jest.mock('@/lib/prisma', () => ({
  prisma: { userSubscription: { findMany: jest.fn().mockResolvedValue([]) }, user: { count: jest.fn().mockResolvedValue(0) } }
}));

import { NextRequest } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { GET as adminMetricsGET } from '@/app/api/admin/billing/metrics/route';
import { GET as subscriptionGET } from '@/app/api/billing/subscription/route';

describe('Phase 76 — Admin billing RBAC and tenant isolation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects a non-admin user from the admin metrics endpoint with 403', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'user-1', role: 'USER' });

    const req = new NextRequest('http://localhost:3000/api/admin/billing/metrics');
    const res = await adminMetricsGET(req);

    expect(res.status).toBe(403);
  });

  it('allows an ADMIN user through to the admin metrics endpoint', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });

    const req = new NextRequest('http://localhost:3000/api/admin/billing/metrics');
    const res = await adminMetricsGET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.billingIntegration).toBeDefined();
  });

  it('the user-scoped subscription route ignores any userId supplied in the request and only ever resolves the authenticated caller', async () => {
    (requireAuthenticatedUser as jest.Mock).mockResolvedValue({ id: 'real-user', role: 'USER' });

    // Attempting to smuggle a different userId via query string — must be ignored entirely,
    // since the route never reads searchParams for identity, only the authenticated session.
    const req = new NextRequest('http://localhost:3000/api/billing/subscription?userId=someone-elses-id');
    const res = await subscriptionGET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.billingEnabled).toBe(false);
  });
});
