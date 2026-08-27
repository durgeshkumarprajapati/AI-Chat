jest.mock('@/lib/prisma', () => ({
  prisma: {
    userSubscription: { findUnique: jest.fn(), create: jest.fn() },
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
import { configService } from '@/features/config';
import { subscriptionService } from '@/features/billing/subscription.service';

const PREMIUM_PLAN = { id: 'plan-premium', code: 'PREMIUM' };
const FREE_PLAN = { id: 'plan-free', code: 'FREE' };

function fullSub(overrides: Partial<any>) {
  return {
    id: 'sub-1',
    userId: 'user-1',
    billingInterval: 'MONTHLY',
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
    ...overrides
  };
}

describe('Phase 76 — 30-day free trial', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (configService.getBoolean as jest.Mock).mockImplementation((key: string) => Promise.resolve(key === 'BILLING_TRIAL_ENABLED'));
    (configService.getNumber as jest.Mock).mockResolvedValue(30);
  });

  it('starts a one-time trial for a brand-new user, on PREMIUM, marking hasUsedTrial', async () => {
    (prisma.userSubscription.findUnique as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce(
      fullSub({ planId: PREMIUM_PLAN.id, status: 'TRIALING', hasUsedTrial: true, plan: PREMIUM_PLAN, trialEndsAt: new Date(Date.now() + 30 * 86400000) })
    );
    (prisma.subscriptionPlan.findUnique as jest.Mock).mockResolvedValue(PREMIUM_PLAN);
    (prisma.userSubscription.create as jest.Mock).mockResolvedValue(fullSub({ planId: PREMIUM_PLAN.id, status: 'TRIALING', hasUsedTrial: true, plan: PREMIUM_PLAN }));

    const sub = await subscriptionService.getOrCreateForUser('user-1');

    expect(sub.status).toBe('TRIALING');
    expect(sub.planCode).toBe('PREMIUM');
    expect(prisma.userSubscription.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ hasUsedTrial: true, status: 'TRIALING' }) })
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'TRIAL_STARTED' }) })
    );
  });

  it('never restarts a trial for a user who already has a subscription row', async () => {
    const existing = fullSub({ planId: FREE_PLAN.id, status: 'ACTIVE', hasUsedTrial: true, plan: FREE_PLAN });
    (prisma.userSubscription.findUnique as jest.Mock).mockResolvedValue(existing);

    const sub = await subscriptionService.getOrCreateForUser('user-1');

    expect(sub.status).toBe('ACTIVE');
    expect(prisma.userSubscription.create).not.toHaveBeenCalled();
  });

  it('lands new users on FREE (no trial) when BILLING_TRIAL_ENABLED is false', async () => {
    (configService.getBoolean as jest.Mock).mockResolvedValue(false);
    (prisma.userSubscription.findUnique as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce(
      fullSub({ planId: FREE_PLAN.id, status: 'ACTIVE', hasUsedTrial: false, plan: FREE_PLAN })
    );
    (prisma.subscriptionPlan.findUnique as jest.Mock).mockResolvedValue(FREE_PLAN);
    (prisma.userSubscription.create as jest.Mock).mockResolvedValue(fullSub({ planId: FREE_PLAN.id, status: 'ACTIVE', hasUsedTrial: false, plan: FREE_PLAN }));

    const sub = await subscriptionService.getOrCreateForUser('user-1');

    expect(sub.status).toBe('ACTIVE');
    expect(sub.planCode).toBe('FREE');
    expect(prisma.userSubscription.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ hasUsedTrial: false, status: 'ACTIVE' }) })
    );
  });
});
