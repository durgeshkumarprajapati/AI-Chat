jest.mock('@/lib/prisma', () => ({
  prisma: {
    userSubscription: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    subscriptionPlan: { findUnique: jest.fn(), findMany: jest.fn() },
    auditLog: { create: jest.fn() }
  }
}));
jest.mock('@/lib/redis', () => ({
  redis: { getJson: jest.fn(), setJson: jest.fn(), del: jest.fn() }
}));

import { prisma } from '@/lib/prisma';
import { subscriptionService } from '@/features/billing/subscription.service';

function mockSub(overrides: Partial<any> = {}) {
  return {
    id: 'sub-1',
    userId: 'user-1',
    planId: 'plan-free',
    status: 'ACTIVE',
    billingInterval: 'MONTHLY',
    trialStartedAt: null,
    trialEndsAt: null,
    hasUsedTrial: false,
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
    plan: { code: 'FREE' },
    ...overrides
  };
}

describe('Phase 76 — Subscription state machine', () => {
  beforeEach(() => jest.clearAllMocks());

  it('allows a legal transition (ACTIVE -> PAST_DUE) and audit-logs it', async () => {
    (prisma.userSubscription.findUnique as jest.Mock).mockResolvedValue(mockSub({ status: 'ACTIVE' }));
    (prisma.userSubscription.update as jest.Mock).mockResolvedValue(mockSub({ status: 'PAST_DUE' }));

    const result = await subscriptionService.transition('sub-1', 'PAST_DUE');

    expect(result.status).toBe('PAST_DUE');
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'SUBSCRIPTION_STATUS_CHANGED' }) })
    );
  });

  it('rejects an illegal transition (CANCELED -> PAST_DUE) without writing anything', async () => {
    (prisma.userSubscription.findUnique as jest.Mock).mockResolvedValue(mockSub({ status: 'CANCELED' }));

    await expect(subscriptionService.transition('sub-1', 'PAST_DUE')).rejects.toThrow(/Illegal subscription state transition/);
    expect(prisma.userSubscription.update).not.toHaveBeenCalled();
  });

  it('rejects an illegal transition (TRIALING -> GRACE_PERIOD, must go through ACTIVE/PAST_DUE first)', async () => {
    (prisma.userSubscription.findUnique as jest.Mock).mockResolvedValue(mockSub({ status: 'TRIALING' }));

    await expect(subscriptionService.transition('sub-1', 'GRACE_PERIOD')).rejects.toThrow(/Illegal subscription state transition/);
  });

  it('sets canceledAt when transitioning into CANCELED', async () => {
    (prisma.userSubscription.findUnique as jest.Mock).mockResolvedValue(mockSub({ status: 'ACTIVE' }));
    (prisma.userSubscription.update as jest.Mock).mockImplementation(({ data }) => Promise.resolve(mockSub({ status: 'CANCELED', ...data })));

    await subscriptionService.transition('sub-1', 'CANCELED');

    expect(prisma.userSubscription.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'CANCELED', canceledAt: expect.any(Date) }) })
    );
  });

  it('cancel() with immediate=false schedules cancellation (CANCEL_SCHEDULED) rather than canceling outright', async () => {
    (prisma.userSubscription.findUnique as jest.Mock).mockResolvedValue(mockSub({ status: 'ACTIVE' }));
    (prisma.userSubscription.update as jest.Mock).mockResolvedValue(mockSub({ status: 'CANCEL_SCHEDULED', cancelAtPeriodEnd: true }));

    const result = await subscriptionService.cancel('user-1', { immediate: false });

    expect(result.status).toBe('CANCEL_SCHEDULED');
    expect(result.cancelAtPeriodEnd).toBe(true);
  });

  it('cancel() refuses to schedule cancellation from a non-cancelable status', async () => {
    (prisma.userSubscription.findUnique as jest.Mock).mockResolvedValue(mockSub({ status: 'PAST_DUE' }));

    await expect(subscriptionService.cancel('user-1', { immediate: false })).rejects.toThrow(/Cannot schedule cancellation/);
  });
});
