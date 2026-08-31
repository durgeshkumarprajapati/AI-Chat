jest.mock('@/lib/prisma', () => ({
  prisma: {
    knowledgeEntity: { findMany: jest.fn(), findUnique: jest.fn() },
    knowledgeRelationship: { findMany: jest.fn() },
    knowledgeEvidence: { findMany: jest.fn() },
    knowledgeBase: { findFirst: jest.fn() },
    userSubscription: { findUnique: jest.fn(), create: jest.fn() },
    subscriptionPlan: { findUnique: jest.fn() },
    usageCounter: { findUnique: jest.fn(), upsert: jest.fn() },
    auditLog: { create: jest.fn() }
  }
}));
jest.mock('@/lib/redis', () => ({
  redis: { getJson: jest.fn(), setJson: jest.fn(), del: jest.fn(), getClient: jest.fn() }
}));
jest.mock('@/features/config', () => ({
  configService: { getBoolean: jest.fn(), getNumber: jest.fn() }
}));

import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { configService } from '@/features/config';
import { kgExplorerService } from '@/features/knowledge-graph-explorer/services/kg-explorer.service';
import { kgExplorerCacheService } from '@/features/knowledge-graph-explorer/cache/kg-explorer-cache.service';
import { AuthorizationError } from '@/errors';

// entitlementService itself is NOT mocked here — the point of this suite is to exercise the real
// gate (src/features/billing/entitlement.service.ts) through KgExplorerService.query(), the same
// way tests/phase76-entitlement-usage.test.ts exercises it directly.

const PRO_PLAN_NO_KG = {
  id: 'plan-pro',
  code: 'PRO',
  features: [
    { featureCode: 'GROUP_RAG_CHAT', isEnabled: true },
    { featureCode: 'KNOWLEDGE_GRAPH', isEnabled: false }
  ],
  limits: []
};

const ACTIVE_SUB = {
  id: 'sub-1',
  userId: 'user-1',
  planId: PRO_PLAN_NO_KG.id,
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
  plan: PRO_PLAN_NO_KG
};

function mockNonBillingConfig(overrides: Record<string, unknown> = {}) {
  const numberDefaults: Record<string, unknown> = {
    KG_EXPLORER_DEFAULT_DEPTH: 2,
    KG_EXPLORER_MAX_DEPTH: 3,
    KG_EXPLORER_INITIAL_NODES: 50,
    KG_EXPLORER_MAX_NODES: 150,
    KG_EXPLORER_MAX_EDGES: 300,
    KG_EXPLORER_MAX_QUERY_RESULTS: 50,
    KG_EXPLORER_TIMEOUT_MS: 3000,
    KG_EXPLORER_CACHE_TTL_SECONDS: 120,
    ...overrides
  };
  (configService.getNumber as jest.Mock).mockImplementation((key: string, def: number) =>
    Promise.resolve(key in numberDefaults ? numberDefaults[key] : def)
  );
}

describe('Phase 84 — KG Explorer entitlement gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    kgExplorerCacheService.clearInMemoryCache();
    (redis.getJson as jest.Mock).mockResolvedValue(null);
    (redis.setJson as jest.Mock).mockResolvedValue(undefined);
    (prisma.knowledgeEntity.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.knowledgeRelationship.findMany as jest.Mock).mockResolvedValue([]);
    mockNonBillingConfig();
  });

  it('BILLING_ENABLED=false: KNOWLEDGE_GRAPH is always available regardless of plan', async () => {
    (configService.getBoolean as jest.Mock).mockImplementation((key: string) => {
      if (key === 'BILLING_ENABLED') return Promise.resolve(false);
      if (key === 'KG_EXPLORER_ENABLED') return Promise.resolve(true);
      return Promise.resolve(false);
    });

    await expect(kgExplorerService.query('user-1', 'USER', { scope: 'PRIVATE' }, {})).resolves.toBeDefined();
    // Billing disabled short-circuits before ever touching subscription/plan tables.
    expect(prisma.userSubscription.findUnique).not.toHaveBeenCalled();
  });

  it('BILLING_ENABLED=true + plan lacking KNOWLEDGE_GRAPH: AuthorizationError surfaces cleanly', async () => {
    (configService.getBoolean as jest.Mock).mockImplementation((key: string) => {
      if (key === 'BILLING_ENABLED') return Promise.resolve(true);
      if (key === 'KG_EXPLORER_ENABLED') return Promise.resolve(true);
      return Promise.resolve(false);
    });
    (prisma.userSubscription.findUnique as jest.Mock).mockResolvedValue(ACTIVE_SUB);
    (prisma.subscriptionPlan.findUnique as jest.Mock).mockResolvedValue(PRO_PLAN_NO_KG);

    await expect(kgExplorerService.query('user-1', 'USER', { scope: 'PRIVATE' }, {})).rejects.toThrow(
      AuthorizationError
    );
    expect(prisma.knowledgeEntity.findMany).not.toHaveBeenCalled();
  });

  it('KG_EXPLORER_ENABLED=false: query is refused with a clear disabled-feature error, no expensive work attempted', async () => {
    (configService.getBoolean as jest.Mock).mockImplementation((key: string) => {
      if (key === 'BILLING_ENABLED') return Promise.resolve(false);
      if (key === 'KG_EXPLORER_ENABLED') return Promise.resolve(false);
      return Promise.resolve(false);
    });

    await expect(kgExplorerService.query('user-1', 'USER', { scope: 'PRIVATE' }, {})).rejects.toThrow(
      AuthorizationError
    );
    expect(prisma.knowledgeEntity.findMany).not.toHaveBeenCalled();
    expect(prisma.knowledgeRelationship.findMany).not.toHaveBeenCalled();
  });
});
