jest.mock('@/lib/prisma', () => ({
  prisma: {
    userSubscription: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    subscriptionPlan: { findUnique: jest.fn() },
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
import { redis } from '@/lib/redis';
import { configService } from '@/features/config';
import { entitlementService } from '@/features/billing/entitlement.service';
import { subscriptionService } from '@/features/billing/subscription.service';

const PLAN = { id: 'plan-free', code: 'FREE', features: [{ featureCode: 'PRIVATE_RAG_CHAT', isEnabled: true }], limits: [] };

function subRow(userId: string, overrides: Partial<any> = {}) {
  return {
    id: `sub-${userId}`,
    userId,
    planId: PLAN.id,
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
    plan: PLAN,
    ...overrides
  };
}

describe('Phase 76 — Entitlement cache isolation and invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (configService.getBoolean as jest.Mock).mockImplementation((key: string) => Promise.resolve(key === 'BILLING_ENABLED'));
    (prisma.subscriptionPlan.findUnique as jest.Mock).mockResolvedValue(PLAN);
  });

  it('caches a user entitlement snapshot under a key scoped to that exact userId', async () => {
    (prisma.userSubscription.findUnique as jest.Mock).mockResolvedValue(subRow('user-a'));
    (redis.getJson as jest.Mock).mockResolvedValue(null);

    await entitlementService.getUserEntitlements('user-a');

    expect(redis.setJson).toHaveBeenCalledWith('docai:billing:entitlements:user:user-a', expect.any(Object), expect.any(Number));
  });

  it('two different users never share a cache read for the same key', async () => {
    (prisma.userSubscription.findUnique as jest.Mock).mockImplementation(() => Promise.resolve(subRow('user-b')));
    (redis.getJson as jest.Mock).mockImplementation((key: string) =>
      Promise.resolve(key === 'docai:billing:entitlements:user:user-a' ? { userId: 'user-a', planCode: 'PREMIUM', features: {} } : null)
    );

    const snapshotA = await entitlementService.getUserEntitlements('user-a');
    const snapshotB = await entitlementService.getUserEntitlements('user-b');

    expect(snapshotA.userId).toBe('user-a');
    expect(snapshotB.userId).toBe('user-b');
  });

  it('a subscription status transition invalidates exactly that user’s cache key', async () => {
    (prisma.userSubscription.findUnique as jest.Mock).mockResolvedValue(subRow('user-c', { status: 'ACTIVE' }));
    (prisma.userSubscription.update as jest.Mock).mockResolvedValue(subRow('user-c', { status: 'PAST_DUE' }));

    await subscriptionService.transition('sub-user-c', 'PAST_DUE');

    expect(redis.del).toHaveBeenCalledWith('docai:billing:entitlements:user:user-c');
  });
});
