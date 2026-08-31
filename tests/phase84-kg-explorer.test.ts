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
    canonicalName: 'Entity One',
    normalizedName: 'entity_one',
    entityType: 'CONCEPT',
    description: 'A concept entity.',
    aliases: [],
    confidence: 0.9,
    status: 'ACTIVE',
    metadata: {},
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
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

describe('Phase 84 — KG Explorer general contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    kgExplorerCacheService.clearInMemoryCache();
    mockConfig();
    (entitlementService.requireFeature as jest.Mock).mockResolvedValue(undefined);
    (redis.getJson as jest.Mock).mockResolvedValue(null);
    (redis.setJson as jest.Mock).mockResolvedValue(undefined);
  });

  it('returns a GraphExplorerResponseDTO with every field present, totals matching array lengths when not truncated', async () => {
    const e1 = makeEntity({ id: 'e1' });
    const e2 = makeEntity({ id: 'e2', canonicalName: 'Entity Two' });
    (prisma.knowledgeEntity.findMany as jest.Mock).mockResolvedValue([e1, e2]);
    (prisma.knowledgeRelationship.findMany as jest.Mock).mockResolvedValue([
      makeRelationship({ id: 'r1', sourceEntityId: 'e1', targetEntityId: 'e2' })
    ]);

    const result = await kgExplorerService.query('user-1', 'USER', { scope: 'PRIVATE' }, {});

    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.totalNodes).toBe(2);
    expect(result.totalEdges).toBe(1);
    expect(result.truncated).toBe(false);
    expect(result.truncationReason).toBeUndefined();
    expect(result.scope).toBe('PRIVATE');
    expect(result.depth).toBe(2);
    expect(typeof result.requestId).toBe('string');
    expect(result.requestId.length).toBeGreaterThan(0);

    const node = result.nodes[0]!;
    expect(node.id).toBe('e1');
    expect(node.type).toBe('ENTITY');
    expect(node.confidenceBand).toBe('HIGH');
    expect(typeof node.updatedAt).toBe('string');

    const edge = result.edges[0]!;
    expect(edge.source).toBe('e1');
    expect(edge.target).toBe('e2');
  });

  it('maps confidence to LOW/MEDIUM/HIGH bands using the documented thresholds', async () => {
    const entities = [
      makeEntity({ id: 'low', confidence: 0.2 }),
      makeEntity({ id: 'mid', confidence: 0.6 }),
      makeEntity({ id: 'high', confidence: 0.9 })
    ];
    (prisma.knowledgeEntity.findMany as jest.Mock).mockResolvedValue(entities);
    (prisma.knowledgeRelationship.findMany as jest.Mock).mockResolvedValue([]);

    const result = await kgExplorerService.query('user-1', 'USER', { scope: 'PRIVATE' }, {});
    const byId = Object.fromEntries(result.nodes.map((n) => [n.id, n.confidenceBand]));
    expect(byId.low).toBe('LOW');
    expect(byId.mid).toBe('MEDIUM');
    expect(byId.high).toBe('HIGH');
  });

  it('getNodeDetail resolves evidence strictly from mocked KnowledgeEvidence rows, never fabricating a documentId', async () => {
    const entity = makeEntity({ id: 'e1', userId: 'user-1' });
    (prisma.knowledgeEntity.findUnique as jest.Mock).mockResolvedValue(entity);
    (prisma.knowledgeEvidence.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'ev1',
        entityId: 'e1',
        documentId: 'doc-real-1',
        chunkId: 'chunk-1',
        pageNumber: 2,
        sourceTextHash: 'hash',
        snippet: 'hello world',
        confidence: 0.7,
        document: { id: 'doc-real-1', filename: 'f.pdf', originalFilename: 'F.pdf' }
      }
    ]);
    (prisma.knowledgeRelationship.findMany as jest.Mock).mockResolvedValue([]);

    const detail = await kgExplorerService.getNodeDetail('user-1', 'USER', 'e1', { scope: 'PRIVATE' });

    expect(detail.evidenceAvailable).toBe(true);
    expect(detail.evidence).toHaveLength(1);
    expect(detail.evidence[0]!.documentId).toBe('doc-real-1');
    expect(detail.evidence[0]!.documentName).toBe('F.pdf');
    expect(detail.relatedDocumentCount).toBe(1);
  });

  it('getNodeDetail returns evidenceAvailable:false cleanly (not an error) when no evidence rows exist', async () => {
    const entity = makeEntity({ id: 'e1', userId: 'user-1' });
    (prisma.knowledgeEntity.findUnique as jest.Mock).mockResolvedValue(entity);
    (prisma.knowledgeEvidence.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.knowledgeRelationship.findMany as jest.Mock).mockResolvedValue([]);

    const detail = await kgExplorerService.getNodeDetail('user-1', 'USER', 'e1', { scope: 'PRIVATE' });

    expect(detail.evidenceAvailable).toBe(false);
    expect(detail.evidence).toHaveLength(0);
  });

  it('getRelationshipTypesInScope returns only distinct relationship types actually present', async () => {
    (prisma.knowledgeRelationship.findMany as jest.Mock).mockResolvedValue([
      { relationshipType: 'USES' },
      { relationshipType: 'DEPENDS_ON' }
    ]);

    const types = await kgExplorerService.getRelationshipTypesInScope('user-1', 'USER', 'PRIVATE');
    expect(types).toEqual(['USES', 'DEPENDS_ON']);
  });
});
