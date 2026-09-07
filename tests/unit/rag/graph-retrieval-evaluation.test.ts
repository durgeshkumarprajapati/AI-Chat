jest.mock('@/lib/prisma', () => ({
  prisma: { knowledgeEvidence: { findMany: jest.fn() } }
}));
jest.mock('@/features/knowledge-graph/retrieval/graph-retrieval.service', () => ({
  graphRetrievalService: { retrieveSubgraph: jest.fn() }
}));

import { prisma } from '@/lib/prisma';
import { graphRetrievalService } from '@/features/knowledge-graph/retrieval/graph-retrieval.service';
import { graphContextAugmenterService } from '@/features/rag/retrieval/graph-context-augmenter.service';
import { RetrievedChunk } from '@/features/rag/retrieval/retrieval.types';

/**
 * Deterministic GraphRAG evaluation suite (Phase 5). No LLM-as-a-judge is used — this project has
 * no such infrastructure today (confirmed: no llm-judge/eval-grader service exists under
 * src/features/rag), so every scenario below asserts on concrete, deterministic output shape
 * instead of a model-graded quality score.
 *
 * Scope note — avoiding duplicate tests under a different name: Scenario C (simple document
 * question — graph should not activate) and the flag-matrix behavior are gating decisions made by
 * AnswerOrchestratorService, not by GraphContextAugmenterService (which has no awareness of query
 * intent — it only runs once the orchestrator has already decided to call it). That decision logic
 * is already covered by tests/unit/rag/graph-retrieval-integration.test.ts (tests #7, #10, #11).
 * This file focuses on what IS this service's responsibility: given a subgraph/evidence result,
 * does it produce useful, correctly-bounded, correctly-isolated, non-duplicated context — Scenarios
 * A, B, D, E, F, G below. D/E/F/G overlap partially with graph-context-augmenter.service.test.ts's
 * unit coverage; kept here too under their scenario names for direct traceability to this phase's
 * required scenario list, not as new mechanics.
 */

const docChunk: RetrievedChunk = {
  id: 'vector-chunk-1', documentId: 'doc-1', filename: 'org-chart.pdf', chunkIndex: 0, pageNumber: 1,
  content: 'The company reorganized its engineering division in 2024.', tokenCount: 12, similarity: 0.75, metadata: {}
};

function mockEvidenceRow(overrides: Partial<{ chunkId: string; documentId: string; entityId: string; relationshipId: string; confidence: number; snippet: string }> = {}) {
  return {
    entityId: overrides.entityId ?? null,
    relationshipId: overrides.relationshipId ?? null,
    chunkId: overrides.chunkId ?? 'graph-chunk-1',
    documentId: overrides.documentId ?? 'doc-2',
    pageNumber: 2,
    snippet: overrides.snippet ?? 'evidence snippet',
    confidence: overrides.confidence ?? 0.9,
    chunk: { content: 'Entity A reports to Entity B as part of the Platform team.', chunkIndex: 1, tokenCount: 15, pageNumber: 2, document: { filename: 'org-chart.pdf' } }
  };
}

describe('GraphRAG evaluation suite (deterministic scenarios)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('Scenario A — Relationship question: subgraph with a direct edge yields relationship evidence as context', async () => {
    (graphRetrievalService.retrieveSubgraph as jest.Mock).mockResolvedValue({
      nodes: [{ id: 'entity-a' }, { id: 'entity-b' }],
      edges: [{ id: 'rel-a-b' }], // Entity A --REPORTS_TO--> Entity B
      evidenceCount: 1, conflictsCount: 0
    });
    (prisma.knowledgeEvidence.findMany as jest.Mock).mockResolvedValue([
      mockEvidenceRow({ relationshipId: 'rel-a-b', chunkId: 'rel-evidence-1' })
    ]);

    const result = await graphContextAugmenterService.augment('user-1', 'How is Entity A related to Entity B?', [docChunk], {});

    expect(result.status).toBe('SUCCESS');
    expect(result.usedGraph).toBe(true);
    expect(result.graphEdgesCount).toBe(1);
    expect(result.chunks.some((c) => c.id === 'rel-evidence-1' && c.retrievalSource === 'graph')).toBe(true);
  });

  it('Scenario B — Multi-hop question: a 2-hop subgraph (A-B, B-C) surfaces evidence for both edges as path context', async () => {
    (graphRetrievalService.retrieveSubgraph as jest.Mock).mockResolvedValue({
      nodes: [{ id: 'entity-a' }, { id: 'entity-b' }, { id: 'entity-c' }],
      edges: [{ id: 'rel-a-b' }, { id: 'rel-b-c' }], // A -> B -> C
      evidenceCount: 2, conflictsCount: 0
    });
    (prisma.knowledgeEvidence.findMany as jest.Mock).mockResolvedValue([
      mockEvidenceRow({ relationshipId: 'rel-a-b', chunkId: 'hop-1-evidence' }),
      mockEvidenceRow({ relationshipId: 'rel-b-c', chunkId: 'hop-2-evidence' })
    ]);

    const result = await graphContextAugmenterService.augment('user-1', 'What connects A to C through B?', [docChunk], {});

    expect(result.status).toBe('SUCCESS');
    expect(result.graphNodesCount).toBe(3);
    expect(result.graphEdgesCount).toBe(2);
    const graphChunkIds = result.chunks.filter((c) => c.retrievalSource === 'graph').map((c) => c.id);
    expect(graphChunkIds).toEqual(expect.arrayContaining(['hop-1-evidence', 'hop-2-evidence']));
  });

  it('Scenario D — No graph available: original vector retrieval passes through unchanged, no failure', async () => {
    (graphRetrievalService.retrieveSubgraph as jest.Mock).mockResolvedValue({ nodes: [], edges: [], evidenceCount: 0, conflictsCount: 0 });

    const result = await graphContextAugmenterService.augment('user-1', 'What is the main purpose of this document?', [docChunk], {});

    expect(result.status).toBe('EMPTY_GRAPH');
    expect(result.chunks).toEqual([docChunk]);
  });

  it('Scenario E — Graph service failure: original retrieval result returned, request does not fail, status reflects the fallback', async () => {
    (graphRetrievalService.retrieveSubgraph as jest.Mock).mockRejectedValue(new Error('graph db timeout'));

    const result = await graphContextAugmenterService.augment('user-1', 'How is Entity A related to Entity B?', [docChunk], {});

    expect(result.status).toBe('FALLBACK_ERROR');
    expect(result.chunks).toEqual([docChunk]);
  });

  it('Scenario F — Duplicate evidence: a chunk already present via vector retrieval is not appended twice', async () => {
    (graphRetrievalService.retrieveSubgraph as jest.Mock).mockResolvedValue({
      nodes: [{ id: 'entity-a' }], edges: [], evidenceCount: 1, conflictsCount: 0
    });
    (prisma.knowledgeEvidence.findMany as jest.Mock).mockResolvedValue([
      mockEvidenceRow({ entityId: 'entity-a', chunkId: docChunk.id, documentId: docChunk.documentId })
    ]);

    const result = await graphContextAugmenterService.augment('user-1', 'q', [docChunk], {});

    expect(result.chunks).toHaveLength(1);
    expect(result.duplicatesRemovedCount).toBe(1);
    expect(result.status).toBe('SUCCESS');
  });

  it('Scenario G — Tenant isolation: graph retrieval for User A never queries with User B\'s id', async () => {
    (graphRetrievalService.retrieveSubgraph as jest.Mock).mockResolvedValue({ nodes: [], edges: [], evidenceCount: 0, conflictsCount: 0 });

    await graphContextAugmenterService.augment('user-A', 'q', [], { knowledgeBaseId: 'kb-belonging-to-user-A' });

    const callArgs = (graphRetrievalService.retrieveSubgraph as jest.Mock).mock.calls[0][0];
    expect(callArgs.userId).toBe('user-A');
    expect(callArgs.userId).not.toBe('user-B');
    // The scope passed through is exactly what the caller supplied — no cross-user value can leak
    // in here since this service accepts no separate "target user" parameter at all, only the
    // single authenticated requester's own id and their own knowledgeBaseId.
  });
});
