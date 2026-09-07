import {
  computeEntityCoverage,
  computeRelationshipCoverage,
  computeGraphContribution,
  computeRedundancy,
  toVariantMetrics,
  buildResultSummary
} from '@/features/rag/evaluation/graph-comparison-metrics';
import { OrchestratedAnswer } from '@/features/rag/orchestration/answer-orchestrator.types';
import { RetrievedChunk } from '@/features/rag/retrieval/retrieval.types';

/**
 * Pure-function tests for the GraphRAG A/B comparison metrics (Phase 9 items #3-6). This module
 * imports nothing beyond types, so it is fully runnable in this sandbox (unlike
 * graph-comparison.test.ts, which imports the real orchestrator/env stack and is blocked by the
 * same pre-existing .env restriction documented across this codebase's other GraphRAG tests).
 */

function chunk(overrides: Partial<RetrievedChunk> & { id: string; content: string }): RetrievedChunk {
  return {
    documentId: overrides.documentId ?? 'doc-1',
    filename: overrides.filename ?? 'doc.pdf',
    chunkIndex: overrides.chunkIndex ?? 0,
    pageNumber: overrides.pageNumber ?? 1,
    tokenCount: overrides.tokenCount ?? 10,
    similarity: overrides.similarity ?? 0.8,
    metadata: overrides.metadata ?? {},
    ...overrides
  };
}

function orchestratedAnswer(overrides: Partial<OrchestratedAnswer>): OrchestratedAnswer {
  return {
    requestId: 'test-request-id',
    conversationId: 'conv-1',
    answerMode: 'DOCUMENT_GROUNDED',
    answer: '',
    citations: [],
    retrievedChunks: [],
    topSimilarity: 0.8,
    cacheHit: false,
    cacheType: 'none',
    llmCalled: true,
    embeddingCalled: true,
    vectorSearchCalled: true,
    keywordSearchCalled: true,
    rerankCalled: true,
    recoveryAttempted: false,
    recoveryAttempts: 0,
    latencyTrace: {},
    ...overrides
  };
}

describe('computeEntityCoverage', () => {
  it('returns undefined when no entities are expected (nothing to measure)', () => {
    expect(computeEntityCoverage(undefined, [], [])).toBeUndefined();
    expect(computeEntityCoverage([], [], [])).toBeUndefined();
  });

  it('directly measures coverage via case-insensitive substring containment', () => {
    const baselineChunks = [chunk({ id: 'b1', content: 'Entity A is a department.' })];
    const graphChunks = [
      chunk({ id: 'b1', content: 'Entity A is a department.' }),
      chunk({ id: 'g1', content: 'entity a reports to entity b as part of the platform team.' })
    ];

    const result = computeEntityCoverage(['Entity A', 'Entity B'], baselineChunks, graphChunks);

    expect(result).toMatchObject({
      measurementType: 'directly_measured',
      expectedEntityCount: 2,
      baselineFoundEntities: ['Entity A'],
      graphFoundEntities: ['Entity A', 'Entity B'],
      baselineCoverage: 0.5,
      graphCoverage: 1,
      coverageDelta: 0.5
    });
  });

  it('reports zero delta (no fabricated improvement) when graph context adds nothing new', () => {
    const chunks = [chunk({ id: 'x', content: 'Entity A only.' })];
    const result = computeEntityCoverage(['Entity A', 'Entity B'], chunks, chunks);
    expect(result?.coverageDelta).toBe(0);
  });
});

describe('computeRelationshipCoverage', () => {
  it('returns undefined when no relationships are expected', () => {
    expect(computeRelationshipCoverage(undefined, [], [])).toBeUndefined();
  });

  it('is labeled heuristic and requires co-occurrence of both entities in one chunk', () => {
    const baselineChunks = [chunk({ id: 'b1', content: 'Entity A works in engineering.' })];
    const graphChunks = [
      chunk({ id: 'g1', content: 'Entity A reports to Entity B as part of the platform team.' })
    ];

    const result = computeRelationshipCoverage(
      [{ from: 'Entity A', to: 'Entity B', keyword: 'reports to' }],
      baselineChunks,
      graphChunks
    );

    expect(result?.measurementType).toBe('heuristic');
    expect(result?.baselineFoundCount).toBe(0);
    expect(result?.graphFoundCount).toBe(1);
    expect(result?.coverageDelta).toBe(1);
  });

  it('requires the optional keyword to match when provided, not just entity co-occurrence', () => {
    const chunks = [chunk({ id: 'g1', content: 'Entity A and Entity B attended the same conference.' })];
    const result = computeRelationshipCoverage(
      [{ from: 'Entity A', to: 'Entity B', keyword: 'reports to' }],
      [],
      chunks
    );
    expect(result?.graphFoundCount).toBe(0);
  });
});

describe('computeGraphContribution', () => {
  it('counts only graph-sourced chunks/documents absent from baseline as unique contribution', () => {
    const baseline = orchestratedAnswer({
      retrievedChunks: [chunk({ id: 'v1', documentId: 'doc-1', content: 'vector chunk' })]
    });
    const graphVariant = orchestratedAnswer({
      retrievedChunks: [
        chunk({ id: 'v1', documentId: 'doc-1', content: 'vector chunk' }),
        chunk({ id: 'g1', documentId: 'doc-2', content: 'graph chunk', retrievalSource: 'graph' })
      ],
      graphRetrieval: {
        attempted: true, executed: true, reason: 'QUERY_CLASSIFIED_GRAPH_RELEVANT', success: true,
        entitiesFound: 1, relationshipsFound: 0, evidenceFound: 1,
        chunksAdded: 1, chunksDeduplicated: 0, chunksDroppedByLimit: 0
      }
    });

    const result = computeGraphContribution(baseline, graphVariant);

    expect(result).toEqual({
      measurementType: 'directly_measured',
      uniqueChunksAdded: 1,
      uniqueDocumentIdsAdded: 1
    });
  });

  it('reports zero contribution when the graph variant added nothing new', () => {
    const baseline = orchestratedAnswer({ retrievedChunks: [chunk({ id: 'v1', content: 'x' })] });
    const graphVariant = orchestratedAnswer({
      retrievedChunks: [chunk({ id: 'v1', content: 'x' })],
      graphRetrieval: {
        attempted: true, executed: true, reason: 'QUERY_CLASSIFIED_GRAPH_RELEVANT', success: true,
        entitiesFound: 0, relationshipsFound: 0, evidenceFound: 0,
        chunksAdded: 0, chunksDeduplicated: 0, chunksDroppedByLimit: 0
      }
    });

    expect(computeGraphContribution(baseline, graphVariant)).toEqual({
      measurementType: 'directly_measured',
      uniqueChunksAdded: 0,
      uniqueDocumentIdsAdded: 0
    });
  });
});

describe('computeRedundancy', () => {
  it('directly reuses GraphContextAugmenterService\'s own dedup counters', () => {
    const graphVariant = orchestratedAnswer({
      graphRetrieval: {
        attempted: true, executed: true, reason: 'QUERY_CLASSIFIED_GRAPH_RELEVANT', success: true,
        entitiesFound: 2, relationshipsFound: 1, evidenceFound: 4,
        chunksAdded: 1, chunksDeduplicated: 3, chunksDroppedByLimit: 0
      }
    });

    expect(computeRedundancy(graphVariant)).toEqual({
      measurementType: 'directly_measured',
      evidenceRecordsExamined: 4,
      duplicatesOfBaseline: 3,
      redundancyRatio: 0.75
    });
  });

  it('avoids a divide-by-zero when no evidence was examined', () => {
    const graphVariant = orchestratedAnswer({});
    expect(computeRedundancy(graphVariant).redundancyRatio).toBe(0);
  });
});

describe('toVariantMetrics', () => {
  it('maps an OrchestratedAnswer into the flat comparison-metrics shape', () => {
    const result = orchestratedAnswer({
      answerMode: 'MULTI_SOURCE_GROUNDED',
      retrievedChunks: [
        chunk({ id: 'v1', content: 'x' }),
        chunk({ id: 'g1', content: 'y', retrievalSource: 'graph' })
      ],
      citations: [{ id: 'cit-1' } as any],
      latencyTrace: { totalMs: 120 },
      graphRetrieval: {
        attempted: true, executed: true, reason: 'QUERY_CLASSIFIED_GRAPH_RELEVANT', success: true,
        entitiesFound: 1, relationshipsFound: 0, evidenceFound: 1,
        chunksAdded: 1, chunksDeduplicated: 0, chunksDroppedByLimit: 0,
        latencyMs: 15, graphChunksInCitationCandidates: 1
      }
    });

    expect(toVariantMetrics(result)).toEqual({
      answerMode: 'MULTI_SOURCE_GROUNDED',
      retrievedChunkCount: 2,
      graphChunkCount: 1,
      totalLatencyMs: 120,
      graphLatencyMs: 15,
      chunksDeduplicated: 0,
      chunksDroppedByLimit: 0,
      citationCount: 1,
      graphCitationCandidateCount: 1
    });
  });
});

describe('buildResultSummary', () => {
  it('never claims a benefit when graph retrieval failed', () => {
    const summary = buildResultSummary({ chunksAdded: 0, graphRetrievalSucceeded: false, graphFailureCategory: 'DATABASE_FAILURE' });
    expect(summary).toContain('did not complete successfully');
    expect(summary).toContain('DATABASE_FAILURE');
    expect(summary.toLowerCase()).not.toContain('improv');
  });

  it('never claims improvement merely because chunks were added, when coverage did not increase', () => {
    const summary = buildResultSummary({
      chunksAdded: 2,
      graphRetrievalSucceeded: true,
      entityCoverageComparison: {
        measurementType: 'directly_measured', expectedEntityCount: 1,
        baselineFoundEntities: ['Entity A'], graphFoundEntities: ['Entity A'],
        baselineCoverage: 1, graphCoverage: 1, coverageDelta: 0
      }
    });
    expect(summary).toContain('added 2 chunk(s)');
    expect(summary).toContain('no measurable improvement');
  });

  it('states a measured improvement only when the delta is actually positive', () => {
    const summary = buildResultSummary({
      chunksAdded: 1,
      graphRetrievalSucceeded: true,
      entityCoverageComparison: {
        measurementType: 'directly_measured', expectedEntityCount: 2,
        baselineFoundEntities: ['Entity A'], graphFoundEntities: ['Entity A', 'Entity B'],
        baselineCoverage: 0.5, graphCoverage: 1, coverageDelta: 0.5
      }
    });
    expect(summary).toContain('Entity coverage improved from 50% to 100%');
  });
});
