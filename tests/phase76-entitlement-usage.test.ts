jest.mock('@/lib/prisma', () => ({
  prisma: {
    userSubscription: { findUnique: jest.fn(), create: jest.fn() },
    subscriptionPlan: { findUnique: jest.fn() },
    usageCounter: { findUnique: jest.fn(), upsert: jest.fn() },
    auditLog: { create: jest.fn() }
  }
}));
jest.mock('@/lib/redis', () => ({
  redis: { getJson: jest.fn(), setJson: jest.fn(), del: jest.fn() }
}));
jest.mock('@/features/config', () => ({
  configService: { getBoolean: jest.fn(), getNumber: jest.fn() }
}));

import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config';
import { entitlementService } from '@/features/billing/entitlement.service';

const PRO_PLAN = {
  id: 'plan-pro',
  code: 'PRO',
  features: [
    { featureCode: 'GROUP_RAG_CHAT', isEnabled: true },
    { featureCode: 'GRAPH_RAG', isEnabled: false }
  ],
  limits: [{ metric: 'RAG_QUERIES', limit: 10, isUnlimited: false, period: 'MONTHLY' }]
};

const ACTIVE_SUB = {
  id: 'sub-1',
  userId: 'user-1',
  planId: PRO_PLAN.id,
  status: 'ACTIVE',
  billingInterval: 'MONTHLY',
  trialStartedAt: null,
  trialEndsAt: null,
  hasUsedTrial: true,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  gracePeriodEndsAt: null,
  cancelAtPeriodEnd: false,
  canceledAt: null,
  razorpaySubscriptionId: null,
  razorpayCustomerId: null,
  isGrandfathered: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  plan: PRO_PLAN
};

describe('Phase 76 — Entitlement gating and usage limits (BILLING_ENABLED=true)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (configService.getBoolean as jest.Mock).mockImplementation((key: string) => {
      if (key === 'BILLING_ENABLED') return Promise.resolve(true);
      return Promise.resolve(false);
    });
    (prisma.userSubscription.findUnique as jest.Mock).mockResolvedValue(ACTIVE_SUB);
    (prisma.subscriptionPlan.findUnique as jest.Mock).mockResolvedValue(PRO_PLAN);
  });

  it('allows a feature the plan enables', async () => {
    await expect(entitlementService.canAccessFeature('user-1', 'GROUP_RAG_CHAT')).resolves.toBe(true);
  });

  it('denies a feature the plan does not enable, and requireFeature audits ENTITLEMENT_DENIED', async () => {
    await expect(entitlementService.canAccessFeature('user-1', 'GRAPH_RAG')).resolves.toBe(false);
    await expect(entitlementService.requireFeature('user-1', 'GRAPH_RAG')).rejects.toThrow(/higher plan/);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'ENTITLEMENT_DENIED', targetId: 'GRAPH_RAG' }) })
    );
  });

  it('checkUsageLimit is informational-only (allowed=true) when enforcement is disabled, even over the cap', async () => {
    (prisma.usageCounter.findUnique as jest.Mock).mockResolvedValue({ count: 999 });
    const result = await entitlementService.checkUsageLimit('user-1', 'RAG_QUERIES');
    expect(result.enforced).toBe(false);
    expect(result.allowed).toBe(true);
    expect(result.currentCount).toBe(999);
  });

  it('checkUsageLimit denies once the count reaches the plan limit when enforcement is enabled', async () => {
    (configService.getBoolean as jest.Mock).mockImplementation((key: string) => Promise.resolve(true));
    (prisma.usageCounter.findUnique as jest.Mock).mockResolvedValue({ count: 10 });

    const result = await entitlementService.checkUsageLimit('user-1', 'RAG_QUERIES');
    expect(result.enforced).toBe(true);
    expect(result.allowed).toBe(false);
  });

  it('consumeUsage increments the counter only when allowed', async () => {
    (configService.getBoolean as jest.Mock).mockImplementation((key: string) => Promise.resolve(true));
    (prisma.usageCounter.findUnique as jest.Mock).mockResolvedValue({ count: 3 });
    (prisma.usageCounter.upsert as jest.Mock).mockResolvedValue({ count: 4 });

    const result = await entitlementService.consumeUsage('user-1', 'RAG_QUERIES');

    expect(result.allowed).toBe(true);
    expect(prisma.usageCounter.upsert).toHaveBeenCalled();
  });

  it('consumeUsage never increments the counter when enforcement denies, and records ENTITLEMENT_DENIED', async () => {
    (configService.getBoolean as jest.Mock).mockImplementation((key: string) => Promise.resolve(true));
    (prisma.usageCounter.findUnique as jest.Mock).mockResolvedValue({ count: 10 });

    const result = await entitlementService.consumeUsage('user-1', 'RAG_QUERIES');

    expect(result.allowed).toBe(false);
    expect(prisma.usageCounter.upsert).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'ENTITLEMENT_DENIED', targetId: 'RAG_QUERIES' }) })
    );
  });
});
