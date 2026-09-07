jest.mock('@/lib/prisma', () => ({
  prisma: {
    knowledgeEvidence: { findMany: jest.fn() }
  }
}));
jest.mock('@/features/knowledge-graph/retrieval/graph-retrieval.service', () => ({
  graphRetrievalService: { retrieveSubgraph: jest.fn() }
}));

import { prisma } from '@/lib/prisma';
import { graphRetrievalService } from '@/features/knowledge-graph/retrieval/graph-retrieval.service';
import { graphContextAugmenterService } from '@/features/rag/retrieval/graph-context-augmenter.service';
import { RetrievedChunk } from '@/features/rag/retrieval/retrieval.types';

const existingChunk: RetrievedChunk = {
  id: 'vec-chunk-1',
  documentId: 'doc-1',
  filename: 'report.pdf',
  chunkIndex: 0,
  pageNumber: 1,
  content: 'Vector-retrieved content.',
  tokenCount: 10,
  similarity: 0.8,
  metadata: {}
};

describe('GraphContextAugmenterService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns existing chunks unchanged when the subgraph has no nodes or edges (empty graph)', async () => {
    (graphRetrievalService.retrieveSubgraph as jest.Mock).mockResolvedValue({
      nodes: [], edges: [], evidenceCount: 0, conflictsCount: 0
    });

    const result = await graphContextAugmenterService.augment('user-1', 'query', [existingChunk], {});

    expect(result.chunks).toEqual([existingChunk]);
    expect(result.usedGraph).toBe(false);
    expect(prisma.knowledgeEvidence.findMany).not.toHaveBeenCalled();
  });

  it('appends non-duplicate graph-sourced evidence chunks when the subgraph resolves', async () => {
    (graphRetrievalService.retrieveSubgraph as jest.Mock).mockResolvedValue({
      nodes: [{ id: 'entity-1' }], edges: [], evidenceCount: 1, conflictsCount: 0
    });
    (prisma.knowledgeEvidence.findMany as jest.Mock).mockResolvedValue([
      {
        entityId: 'entity-1',
        relationshipId: null,
        chunkId: 'graph-chunk-1',
        documentId: 'doc-2',
        pageNumber: 3,
        snippet: 'Graph evidence snippet.',
        confidence: 0.92,
        chunk: {
          content: 'Graph evidence chunk content.',
          chunkIndex: 2,
          tokenCount: 12,
          pageNumber: 3,
          document: { filename: 'kg-source.pdf' }
        }
      }
    ]);

    const result = await graphContextAugmenterService.augment('user-1', 'query', [existingChunk], {});

    expect(result.usedGraph).toBe(true);
    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[1]).toMatchObject({
      id: 'graph-chunk-1',
      documentId: 'doc-2',
      filename: 'kg-source.pdf',
      retrievalSource: 'graph',
      sourceType: 'DOCUMENT',
      similarity: 0.92
    });
    // The original vector chunk must remain first and unmodified — augmentation only appends.
    expect(result.chunks[0]).toEqual(existingChunk);
  });

  it('does not duplicate a chunk already present in the existing (vector/keyword) results', async () => {
    (graphRetrievalService.retrieveSubgraph as jest.Mock).mockResolvedValue({
      nodes: [{ id: 'entity-1' }], edges: [], evidenceCount: 1, conflictsCount: 0
    });
    (prisma.knowledgeEvidence.findMany as jest.Mock).mockResolvedValue([
      {
        entityId: 'entity-1',
        relationshipId: null,
        chunkId: existingChunk.id, // same chunk the vector step already returned
        documentId: existingChunk.documentId,
        pageNumber: 1,
        snippet: 'dup',
        confidence: 0.95,
        chunk: { content: 'x', chunkIndex: 0, tokenCount: 10, pageNumber: 1, document: { filename: 'report.pdf' } }
      }
    ]);

    const result = await graphContextAugmenterService.augment('user-1', 'query', [existingChunk], {});

    expect(result.chunks).toHaveLength(1);
    expect(result.usedGraph).toBe(false);
  });

  it('falls back to the unmodified chunk list when graph retrieval throws (never breaks the caller)', async () => {
    (graphRetrievalService.retrieveSubgraph as jest.Mock).mockRejectedValue(new Error('graph db unavailable'));

    const result = await graphContextAugmenterService.augment('user-1', 'query', [existingChunk], {});

    expect(result.chunks).toEqual([existingChunk]);
    expect(result.usedGraph).toBe(false);
  });

  it('falls back to the unmodified chunk list when the subgraph query exceeds the timeout (Phase 8 resilience)', async () => {
    // Never resolves within the test's lifetime — simulates a hung/slow DB query. A short custom
    // timeoutMs (20ms) is passed explicitly so this test doesn't need to wait out the real
    // production default (RAG_GRAPH_TIMEOUT_MS, 2500ms).
    (graphRetrievalService.retrieveSubgraph as jest.Mock).mockReturnValue(new Promise(() => {}));

    const result = await graphContextAugmenterService.augment('user-1', 'query', [existingChunk], {}, 20);

    expect(result.status).toBe('FALLBACK_ERROR');
    expect(result.chunks).toEqual([existingChunk]);
  });

  it('falls back to the unmodified chunk list when the evidence lookup itself throws', async () => {
    (graphRetrievalService.retrieveSubgraph as jest.Mock).mockResolvedValue({
      nodes: [{ id: 'entity-1' }], edges: [], evidenceCount: 1, conflictsCount: 0
    });
    (prisma.knowledgeEvidence.findMany as jest.Mock).mockRejectedValue(new Error('evidence query failed'));

    const result = await graphContextAugmenterService.augment('user-1', 'query', [existingChunk], {});

    expect(result.chunks).toEqual([existingChunk]);
    expect(result.usedGraph).toBe(false);
  });

  it('scopes graph retrieval to the requesting user (isolation) — passes only the caller-supplied userId/knowledgeBaseId through', async () => {
    (graphRetrievalService.retrieveSubgraph as jest.Mock).mockResolvedValue({
      nodes: [], edges: [], evidenceCount: 0, conflictsCount: 0
    });

    await graphContextAugmenterService.augment('user-isolated', 'query', [], { knowledgeBaseId: 'kb-1' });

    expect(graphRetrievalService.retrieveSubgraph).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-isolated', knowledgeBaseId: 'kb-1' })
    );
  });

  it('caps appended graph chunks at the bounded maximum even if more evidence rows are returned', async () => {
    (graphRetrievalService.retrieveSubgraph as jest.Mock).mockResolvedValue({
      nodes: [{ id: 'entity-1' }], edges: [], evidenceCount: 5, conflictsCount: 0
    });
    (prisma.knowledgeEvidence.findMany as jest.Mock).mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => ({
        entityId: 'entity-1',
        relationshipId: null,
        chunkId: `graph-chunk-${i}`,
        documentId: `doc-${i}`,
        pageNumber: 1,
        snippet: 's',
        confidence: 0.9,
        chunk: { content: `content-${i}`, chunkIndex: i, tokenCount: 5, pageNumber: 1, document: { filename: 'f.pdf' } }
      }))
    );

    const result = await graphContextAugmenterService.augment('user-1', 'query', [], {});

    // MAX_GRAPH_CONTEXT_CHUNKS = 3 — bounded regardless of how much evidence exists, to keep
    // prompt-size growth predictable.
    expect(result.chunks).toHaveLength(3);
  });
});
