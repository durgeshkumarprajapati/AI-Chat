jest.mock('@/lib/prisma', () => ({
  prisma: {
    knowledgeEntity: { findMany: jest.fn(), findUnique: jest.fn() },
    knowledgeRelationship: { findMany: jest.fn() },
    knowledgeEvidence: { findMany: jest.fn() },
    knowledgeBase: { findFirst: jest.fn() },
    auditLog: { create: jest.fn() }
  }
}));
jest.mock('@/lib/redis', () => ({
  redis: { getJson: jest.fn(), setJson: jest.fn(), del: jest.fn(), getClient: jest.fn() }
}));
jest.mock('@/features/config', () => ({
  configService: { getBoolean: jest.fn(), getNumber: jest.fn() }
}));
jest.mock('@/features/billing/entitlement.service', () => ({
  entitlementService: { requireFeature: jest.fn() }
}));
jest.mock('@/features/knowledge-graph/knowledge-graph.rbac', () => ({
  knowledgeGraphRBAC: { canViewGraph: jest.fn(), canMutateGraph: jest.fn(), canAdministerGraph: jest.fn() }
}));
jest.mock('@/features/audit/audit.service', () => ({
  auditService: { logEvent: jest.fn() }
}));
jest.mock('@/features/llm/llm-gateway.service', () => ({
  llmGateway: { generate: jest.fn() }
}));
jest.mock('@/features/rag/performance/rag-execution-context', () => ({
  ragExecutionContextManager: { create: jest.fn() }
}));

import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { configService } from '@/features/config';
import { entitlementService } from '@/features/billing/entitlement.service';
import { ragExecutionContextManager } from '@/features/rag/performance/rag-execution-context';
import { kgExplorerService } from '@/features/knowledge-graph-explorer/services/kg-explorer.service';
import { kgExplorerCacheService } from '@/features/knowledge-graph-explorer/cache/kg-explorer-cache.service';

function mockConfig(overrides: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    KG_EXPLORER_ENABLED: true,
    KG_EXPLORER_DEFAULT_DEPTH: 2,
    KG_EXPLORER_MAX_DEPTH: 3,
    KG_EXPLORER_INITIAL_NODES: 50,
    KG_EXPLORER_MAX_NODES: 150,
    KG_EXPLORER_MAX_EDGES: 300,
    KG_EXPLORER_MAX_QUERY_RESULTS: 50,
    KG_EXPLORER_TIMEOUT_MS: 3000,
    KG_EXPLORER_CACHE_TTL_SECONDS: 120
  };
  const merged = { ...defaults, ...overrides };
  (configService.getBoolean as jest.Mock).mockImplementation((key: string, def: boolean) =>
    Promise.resolve(key in merged ? merged[key] : def)
  );
  (configService.getNumber as jest.Mock).mockImplementation((key: string, def: number) =>
    Promise.resolve(key in merged ? merged[key] : def)
  );
}

function makeEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1',
    userId: 'user-1',
    projectId: null,
    knowledgeBaseId: null,
    canonicalName: 'Entity',
    normalizedName: 'entity',
    entityType: 'CONCEPT',
    description: 'desc',
    aliases: [],
    confidence: 0.9,
    status: 'ACTIVE',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

function makeRelationship(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    userId: 'user-1',
    projectId: null,
    sourceEntityId: 'e1',
    targetEntityId: 'e2',
    relationshipType: 'RELATED_TO',
    description: null,
    confidence: 0.8,
    status: 'ACTIVE',
    fingerprint: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

const REAL_EXEC_CTX = () => ({
  requestId: 'real-ctx',
  startedAt: Date.now(),
  deadlineAt: Date.now() + 60000,
  hasExpired: () => false,
  remainingMs: () => 60000,
  checkStageBudget: (_s: string, budget: number) => budget
});

describe('Phase 84 — KG Explorer performance and limits', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    kgExplorerCacheService.clearInMemoryCache();
    mockConfig();
    (entitlementService.requireFeature as jest.Mock).mockResolvedValue(undefined);
    (redis.getJson as jest.Mock).mockResolvedValue(null);
    (redis.setJson as jest.Mock).mockResolvedValue(undefined);
    (ragExecutionContextManager.create as jest.Mock).mockImplementation(REAL_EXEC_CTX);
  });

  it('never exceeds KG_EXPLORER_MAX_NODES even when the repository would return more (default graph)', async () => {
    mockConfig({ KG_EXPLORER_MAX_NODES: 3, KG_EXPLORER_INITIAL_NODES: 10 });
    const entities = Array.from({ length: 10 }, (_, i) => makeEntity({ id: `e${i}` }));
    (prisma.knowledgeEntity.findMany as jest.Mock).mockResolvedValue(entities);
    (prisma.knowledgeRelationship.findMany as jest.Mock).mockResolvedValue([]);

    const result = await kgExplorerService.query('user-1', 'USER', { scope: 'PRIVATE' }, {});

    expect(result.nodes.length).toBeLessThanOrEqual(3);
    expect(result.truncated).toBe(true);
    expect(result.truncationReason).toBe('MAX_NODES');
  });

  it('never exceeds KG_EXPLORER_MAX_EDGES even when the repository would return more (default graph)', async () => {
    mockConfig({ KG_EXPLORER_MAX_EDGES: 2, KG_EXPLORER_MAX_NODES: 50, KG_EXPLORER_INITIAL_NODES: 50 });
    const entities = [makeEntity({ id: 'e1' }), makeEntity({ id: 'e2' })];
    (prisma.knowledgeEntity.findMany as jest.Mock).mockResolvedValue(entities);
    const rels = Array.from({ length: 5 }, (_, i) =>
      makeRelationship({ id: `r${i}`, sourceEntityId: 'e1', targetEntityId: 'e2' })
    );
    (prisma.knowledgeRelationship.findMany as jest.Mock).mockResolvedValue(rels);

    const result = await kgExplorerService.query('user-1', 'USER', { scope: 'PRIVATE' }, {});

    expect(result.edges.length).toBeLessThanOrEqual(2);
    expect(result.truncated).toBe(true);
    expect(result.truncationReason).toBe('MAX_EDGES');
  });

  it('clamps depth to KG_EXPLORER_MAX_DEPTH even when the caller requests depth=99', async () => {
    mockConfig({ KG_EXPLORER_MAX_DEPTH: 3 });
    (prisma.knowledgeEntity.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.knowledgeRelationship.findMany as jest.Mock).mockResolvedValue([]);

    const result = await kgExplorerService.query('user-1', 'USER', { scope: 'PRIVATE', depth: 99 }, {});

    expect(result.depth).toBe(3);
  });

  it('clamps a depth of 0 or negative up to the minimum of 1', async () => {
    (prisma.knowledgeEntity.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.knowledgeRelationship.findMany as jest.Mock).mockResolvedValue([]);

    const result = await kgExplorerService.query('user-1', 'USER', { scope: 'PRIVATE', depth: -5 }, {});

    expect(result.depth).toBe(1);
  });

  it('stops expanding and returns truncated:true, truncationReason: TIMEOUT when the execution context is already expired, rather than hanging or throwing', async () => {
    (ragExecutionContextManager.create as jest.Mock).mockReturnValue({
      requestId: 'expired-ctx',
      startedAt: Date.now() - 10000,
      deadlineAt: Date.now() - 1,
      hasExpired: () => true,
      remainingMs: () => 0,
      checkStageBudget: () => 0
    });

    const seed = makeEntity({ id: 'e1' });
    (prisma.knowledgeEntity.findMany as jest.Mock).mockResolvedValue([seed]);
    (prisma.knowledgeRelationship.findMany as jest.Mock).mockResolvedValue([]);

    const result = await kgExplorerService.query(
      'user-1',
      'USER',
      { scope: 'PRIVATE', query: 'concept' },
      {}
    );

    expect(result.truncated).toBe(true);
    expect(result.truncationReason).toBe('TIMEOUT');
    expect(result.nodes).toHaveLength(1);
  });
});
