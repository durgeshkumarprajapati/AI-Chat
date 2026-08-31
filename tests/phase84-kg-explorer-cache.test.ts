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

import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
import { configService } from '@/features/config';
import { entitlementService } from '@/features/billing/entitlement.service';
import { knowledgeGraphRBAC } from '@/features/knowledge-graph/knowledge-graph.rbac';
import { kgExplorerService } from '@/features/knowledge-graph-explorer/services/kg-explorer.service';
import { kgExplorerCacheService } from '@/features/knowledge-graph-explorer/cache/kg-explorer-cache.service';
import { GraphExplorerResponseDTO } from '@/features/knowledge-graph-explorer/types/kg-explorer.types';

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

describe('Phase 84 — KG Explorer cache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    kgExplorerCacheService.clearInMemoryCache();
    mockConfig();
    (entitlementService.requireFeature as jest.Mock).mockResolvedValue(undefined);
    (redis.getJson as jest.Mock).mockResolvedValue(null);
    (redis.setJson as jest.Mock).mockResolvedValue(undefined);
  });

  it('a cache hit skips the repository query entirely', async () => {
    const cachedResponse: GraphExplorerResponseDTO = {
      nodes: [],
      edges: [],
      query: '',
      scope: 'PRIVATE',
      depth: 2,
      truncated: false,
      totalNodes: 0,
      totalEdges: 0,
      requestId: 'cached-req'
    };
    (redis.getJson as jest.Mock).mockResolvedValue(cachedResponse);

    const result = await kgExplorerService.query('user-1', 'USER', { scope: 'PRIVATE' }, {});

    expect(result).toEqual(cachedResponse);
    expect(prisma.knowledgeEntity.findMany).not.toHaveBeenCalled();
    expect(prisma.knowledgeRelationship.findMany).not.toHaveBeenCalled();
  });

  it('cache key differs across different scopeIds for the same query text/depth/filters (isolation)', () => {
    const key1 = kgExplorerCacheService.buildCacheKey('PROJECT', 'proj-1', 'qhash', 2, 'fhash');
    const key2 = kgExplorerCacheService.buildCacheKey('PROJECT', 'proj-2', 'qhash', 2, 'fhash');
    expect(key1).not.toBe(key2);
  });

  it('cache key differs across different scopes for otherwise identical parameters', () => {
    const key1 = kgExplorerCacheService.buildCacheKey('PRIVATE', 'user-1', 'qhash', 2, 'fhash');
    const key2 = kgExplorerCacheService.buildCacheKey('PROJECT', 'user-1', 'qhash', 2, 'fhash');
    expect(key1).not.toBe(key2);
  });

  it('two different projectIds produce two different cache keys end-to-end via query()', async () => {
    (knowledgeGraphRBAC.canViewGraph as jest.Mock).mockResolvedValue(true);
    (prisma.knowledgeEntity.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.knowledgeRelationship.findMany as jest.Mock).mockResolvedValue([]);

    await kgExplorerService.query('user-1', 'USER', { scope: 'PROJECT', projectId: 'proj-a' }, {});
    await kgExplorerService.query('user-1', 'USER', { scope: 'PROJECT', projectId: 'proj-b' }, {});

    const setJsonCalls = (redis.setJson as jest.Mock).mock.calls;
    expect(setJsonCalls.length).toBeGreaterThanOrEqual(2);
    const keys = setJsonCalls.map((c) => c[0]);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('KgExplorerCacheService.get falls back to the in-memory store when redis.getJson throws', async () => {
    (redis.getJson as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));
    (redis.setJson as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

    await kgExplorerCacheService.set('kg:explorer:v1:test-key', { foo: 'bar' }, 60);
    const val = await kgExplorerCacheService.get('kg:explorer:v1:test-key');

    expect(val).toEqual({ foo: 'bar' });
  });

  it('a Redis outage (getJson/setJson throwing) still returns a correct result via DB fallback, never crashing the request', async () => {
    (redis.getJson as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));
    (redis.setJson as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

    const entity = makeEntity({ id: 'e1' });
    (prisma.knowledgeEntity.findMany as jest.Mock).mockResolvedValue([entity]);
    (prisma.knowledgeRelationship.findMany as jest.Mock).mockResolvedValue([]);

    const result = await kgExplorerService.query('user-1', 'USER', { scope: 'PRIVATE' }, {});

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]!.id).toBe('e1');
  });
});
