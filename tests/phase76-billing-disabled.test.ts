jest.mock('@/lib/prisma', () => ({
  prisma: {
    userSubscription: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    subscriptionPlan: { findUnique: jest.fn(), findMany: jest.fn() },
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

describe('Phase 76 — BILLING_ENABLED=false backward-compatible mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (configService.getBoolean as jest.Mock).mockImplementation((key: string, def: boolean) => {
      if (key === 'BILLING_ENABLED') return Promise.resolve(false);
      return Promise.resolve(def);
    });
  });

  it('canAccessFeature always resolves true without touching the database', async () => {
    const allowed = await entitlementService.canAccessFeature('user-1', 'GROUP_RAG_CHAT');
    expect(allowed).toBe(true);
    expect(prisma.userSubscription.findUnique).not.toHaveBeenCalled();
    expect(prisma.userSubscription.create).not.toHaveBeenCalled();
  });

  it('requireFeature never throws and never audits a denial', async () => {
    await expect(entitlementService.requireFeature('user-1', 'PROJECT_RAG_WORKSPACE')).resolves.toBeUndefined();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('getUserEntitlements reports billingBypassed=true and never provisions a subscription row', async () => {
    const snapshot = await entitlementService.getUserEntitlements('user-1');
    expect(snapshot.billingBypassed).toBe(true);
    expect(prisma.userSubscription.findUnique).not.toHaveBeenCalled();
    expect(prisma.userSubscription.create).not.toHaveBeenCalled();
  });

  it('checkUsageLimit and consumeUsage are always allowed and never write a usage counter', async () => {
    const check = await entitlementService.checkUsageLimit('user-1', 'RAG_QUERIES');
    expect(check.allowed).toBe(true);
    expect(check.enforced).toBe(false);

    const consumed = await entitlementService.consumeUsage('user-1', 'RAG_QUERIES');
    expect(consumed.allowed).toBe(true);
    expect(prisma.usageCounter.upsert).not.toHaveBeenCalled();
  });
});
