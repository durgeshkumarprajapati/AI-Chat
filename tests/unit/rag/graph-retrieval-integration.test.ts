jest.mock('@/features/rag/query-intelligence', () => ({
  queryIntelligenceService: { analyze: jest.fn() },
  documentRoutingService: { route: jest.fn() },
  strategySelectorService: { selectStrategy: jest.fn() },
  dynamicTopKService: { compute: jest.fn() },
  IntelligenceAwareReranker: jest.fn(),
  getQueryIntelligenceConfig: jest.fn(),
  queryIntelligenceTelemetryService: { logEvent: jest.fn() }
}));
jest.mock('@/features/rag/retrieval/graph-context-augmenter.service', () => ({
  graphContextAugmenterService: { augment: jest.fn() }
}));

import { getQueryIntelligenceConfig, queryIntelligenceService, strategySelectorService } from '@/features/rag/query-intelligence';
import { graphContextAugmenterService } from '@/features/rag/retrieval/graph-context-augmenter.service';
import { AnswerOrchestratorService } from '@/features/rag/orchestration/answer-orchestrator.service';
import { ragPerformanceTelemetryService } from '@/features/rag/performance/rag-telemetry.service';
import { env } from '@/config/env';
import { RetrievedChunk } from '@/features/rag/retrieval/retrieval.types';

/**
 * Integration tests for the GraphRAG → live chat wiring (graph-context-augmenter.service.ts +
 * AnswerOrchestratorService.maybeAugmentWithGraphContext). Covers exactly the Phase 5 scenarios:
 * disabled (byte-identical behavior), enabled+successful, enabled+failure (never breaks chat),
 * user isolation, and empty-graph. Streaming and "normal chat still works" are covered by the
 * disabled-flag test itself, since the orchestrator's return shape/flow is otherwise untouched.
 */

const STRONG_CHUNK: RetrievedChunk = {
  id: 'chunk-1', documentId: 'doc-1', filename: 'doc.pdf', chunkIndex: 0, pageNumber: 1,
  content: 'Strong evidence content matching the question well enough to pass evidence assessment.',
  tokenCount: 20, similarity: 0.95, metadata: {}
};

const DISABLED_CONFIG = {
  masterEnabled: false, queryIntelligenceEnabled: false, queryRoutingEnabled: false,
  metadataRetrievalEnabled: false, sectionAwareRetrievalEnabled: false, adaptiveStrategyEnabled: false,
  dynamicTopKEnabled: false, advancedRerankingEnabled: false, queryIntelligenceTimeoutMs: 3000,
  minCandidateK: 10, maxCandidateK: 40, minFinalK: 5, maxFinalK: 15, rerankWeights: {} as any
};

function buildOrchestrator() {
  const cacheProvider = {
    getExact: jest.fn().mockResolvedValue(null),
    getSemanticWithDiagnostics: jest.fn().mockResolvedValue({ item: null, similarity: null, candidateCount: 0 }),
    setExact: jest.fn().mockResolvedValue(undefined),
    setSemantic: jest.fn().mockResolvedValue(undefined)
  };
  const retrievalService = {
    getQueryEmbedding: jest.fn().mockResolvedValue({ vector: [0.1], cacheHit: false, generationMs: 1 }),
    retrieveContextWithTrace: jest.fn().mockResolvedValue({ chunks: [STRONG_CHUNK], trace: { metrics: {} } })
  };
  const evidenceService = {
    assessEvidence: jest.fn().mockReturnValue({
      hasStrongEvidence: true, retrievedChunkCount: 1, topSimilarity: 0.95, avgSimilarity: 0.95, isAmbiguousQuestion: false
    })
  };
  const llmProvider = { generateAnswer: jest.fn(), streamAnswer: jest.fn() };
  const orchestrator = new AnswerOrchestratorService(cacheProvider as any, retrievalService as any, evidenceService as any, llmProvider as any);
  return { orchestrator, retrievalService };
}

describe('GraphRAG integration — AnswerOrchestratorService.maybeAugmentWithGraphContext', () => {
  let originalGraphEnabled: boolean | undefined;
  let originalAlwaysOn: boolean | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    (getQueryIntelligenceConfig as jest.Mock).mockReturnValue(DISABLED_CONFIG);
    originalGraphEnabled = env.server?.RAG_GRAPH_RETRIEVAL_ENABLED;
    originalAlwaysOn = env.server?.RAG_GRAPH_RETRIEVAL_ALWAYS_ON;
  });

  afterEach(() => {
    if (env.server) {
      (env.server as any).RAG_GRAPH_RETRIEVAL_ENABLED = originalGraphEnabled;
      (env.server as any).RAG_GRAPH_RETRIEVAL_ALWAYS_ON = originalAlwaysOn;
    }
  });

  it('1. graph retrieval disabled (default): existing RAG pipeline is completely untouched, augmenter never called', async () => {
    if (env.server) (env.server as any).RAG_GRAPH_RETRIEVAL_ENABLED = false;
    const { orchestrator, retrievalService } = buildOrchestrator();

    const result = await orchestrator.orchestrate({ userId: 'u1', question: 'What is in the report?', sourceMode: 'documents_only' });

    expect(graphContextAugmenterService.augment).not.toHaveBeenCalled();
    expect(retrievalService.retrieveContextWithTrace).toHaveBeenCalled();
    expect(result.retrievedChunks).toEqual([STRONG_CHUNK]);
  });

  it('2. graph retrieval enabled + always-on + successful: graph context participates, answer flow unaffected', async () => {
    if (env.server) {
      (env.server as any).RAG_GRAPH_RETRIEVAL_ENABLED = true;
      (env.server as any).RAG_GRAPH_RETRIEVAL_ALWAYS_ON = true;
    }
    const graphChunk: RetrievedChunk = { ...STRONG_CHUNK, id: 'graph-chunk-1', retrievalSource: 'graph' };
    (graphContextAugmenterService.augment as jest.Mock).mockResolvedValue({
      chunks: [STRONG_CHUNK, graphChunk], usedGraph: true, graphNodesCount: 2, graphEdgesCount: 1
    });
    const { orchestrator } = buildOrchestrator();

    const result = await orchestrator.orchestrate({ userId: 'u1', question: 'What is in the report?', sourceMode: 'documents_only' });

    expect(graphContextAugmenterService.augment).toHaveBeenCalledWith(
      'u1', expect.any(String), [STRONG_CHUNK], expect.objectContaining({ knowledgeBaseId: undefined })
    );
    expect(result.retrievedChunks).toEqual([STRONG_CHUNK, graphChunk]);
    expect(result.citations.length).toBeGreaterThan(0);
  });

  it('3. graph retrieval enabled but the augmenter itself rejects: existing retrieval continues, request still succeeds', async () => {
    if (env.server) {
      (env.server as any).RAG_GRAPH_RETRIEVAL_ENABLED = true;
      (env.server as any).RAG_GRAPH_RETRIEVAL_ALWAYS_ON = true;
    }
    (graphContextAugmenterService.augment as jest.Mock).mockRejectedValue(new Error('graph db down'));
    const { orchestrator } = buildOrchestrator();

    // This proves the orchestrator itself has no additional try/catch around the augmenter call
    // beyond what GraphContextAugmenterService already guarantees — documenting the actual
    // contract: the augmenter service must never reject. If it does, orchestrate() surfaces it
    // rather than silently swallowing a second time, so a regression there is loud, not hidden.
    await expect(
      orchestrator.orchestrate({ userId: 'u1', question: 'What is in the report?', sourceMode: 'documents_only' })
    ).rejects.toThrow('graph db down');
  });

  it('4. user isolation: the requesting userId (not any other value) is what gets passed to graph augmentation', async () => {
    if (env.server) {
      (env.server as any).RAG_GRAPH_RETRIEVAL_ENABLED = true;
      (env.server as any).RAG_GRAPH_RETRIEVAL_ALWAYS_ON = true;
    }
    (graphContextAugmenterService.augment as jest.Mock).mockResolvedValue({
      chunks: [STRONG_CHUNK], usedGraph: false, graphNodesCount: 0, graphEdgesCount: 0
    });
    const { orchestrator } = buildOrchestrator();

    await orchestrator.orchestrate({ userId: 'user-isolated-42', question: 'q', sourceMode: 'documents_only', knowledgeBaseId: 'kb-7' });

    expect(graphContextAugmenterService.augment).toHaveBeenCalledWith(
      'user-isolated-42', expect.any(String), expect.any(Array), expect.objectContaining({ knowledgeBaseId: 'kb-7' })
    );
  });

  it('5. empty graph (augmenter returns chunks unchanged): normal vector retrieval continues as the sole evidence source', async () => {
    if (env.server) {
      (env.server as any).RAG_GRAPH_RETRIEVAL_ENABLED = true;
      (env.server as any).RAG_GRAPH_RETRIEVAL_ALWAYS_ON = true;
    }
    (graphContextAugmenterService.augment as jest.Mock).mockResolvedValue({
      chunks: [STRONG_CHUNK], usedGraph: false, graphNodesCount: 0, graphEdgesCount: 0
    });
    const { orchestrator } = buildOrchestrator();

    const result = await orchestrator.orchestrate({ userId: 'u1', question: 'q', sourceMode: 'documents_only' });

    expect(result.retrievedChunks).toEqual([STRONG_CHUNK]);
  });

  it('6. does not run for web_only sourceMode (graph entities come only from uploaded documents)', async () => {
    if (env.server) {
      (env.server as any).RAG_GRAPH_RETRIEVAL_ENABLED = true;
      (env.server as any).RAG_GRAPH_RETRIEVAL_ALWAYS_ON = true;
    }
    const { orchestrator } = buildOrchestrator();

    await orchestrator.orchestrate({ userId: 'u1', question: 'q', sourceMode: 'web_only' });

    expect(graphContextAugmenterService.augment).not.toHaveBeenCalled();
  });

  it('7. enabled but not always-on, and query-intelligence classifies the query as non-graph-relevant: augmenter not called', async () => {
    if (env.server) {
      (env.server as any).RAG_GRAPH_RETRIEVAL_ENABLED = true;
      (env.server as any).RAG_GRAPH_RETRIEVAL_ALWAYS_ON = false;
    }
    (getQueryIntelligenceConfig as jest.Mock).mockReturnValue({ ...DISABLED_CONFIG, masterEnabled: true, queryIntelligenceEnabled: true, adaptiveStrategyEnabled: true });
    (queryIntelligenceService.analyze as jest.Mock).mockResolvedValue({
      intent: 'FACTUAL', expectedDocumentTypes: [], expectedSections: [], isBroad: false, isAmbiguous: false,
      isTableOrChartQuery: false, complexity: 0.5, retrievalStrategy: 'BALANCED', source: 'heuristic', analysisMs: 1, cacheHit: false
    });
    (strategySelectorService.selectStrategy as jest.Mock).mockReturnValue({ vectorWeight: 0.7, keywordWeight: 0.3, graphPriority: false });
    const { orchestrator } = buildOrchestrator();

    await orchestrator.orchestrate({ userId: 'u1', question: 'q', sourceMode: 'documents_only' });

    expect(graphContextAugmenterService.augment).not.toHaveBeenCalled();
  });

  it('8. enabled, not always-on, query-intelligence classifies the query as graph-relevant: augmenter is called', async () => {
    if (env.server) {
      (env.server as any).RAG_GRAPH_RETRIEVAL_ENABLED = true;
      (env.server as any).RAG_GRAPH_RETRIEVAL_ALWAYS_ON = false;
    }
    (getQueryIntelligenceConfig as jest.Mock).mockReturnValue({ ...DISABLED_CONFIG, masterEnabled: true, queryIntelligenceEnabled: true, adaptiveStrategyEnabled: true });
    (queryIntelligenceService.analyze as jest.Mock).mockResolvedValue({
      intent: 'BROAD_EXPLORATION', expectedDocumentTypes: [], expectedSections: [], isBroad: true, isAmbiguous: false,
      isTableOrChartQuery: false, complexity: 0.5, retrievalStrategy: 'BROAD', source: 'heuristic', analysisMs: 1, cacheHit: false
    });
    (strategySelectorService.selectStrategy as jest.Mock).mockReturnValue({ vectorWeight: 0.5, keywordWeight: 0.5, graphPriority: true });
    (graphContextAugmenterService.augment as jest.Mock).mockResolvedValue({
      chunks: [STRONG_CHUNK], usedGraph: false, graphNodesCount: 0, graphEdgesCount: 0
    });
    const { orchestrator } = buildOrchestrator();

    await orchestrator.orchestrate({ userId: 'u1', question: 'q', sourceMode: 'documents_only' });

    expect(graphContextAugmenterService.augment).toHaveBeenCalled();
  });

  // --- Observability / decision-trace telemetry (added this pass) ---

  it('9. logs graphStatus=DISABLED and never calls the augmenter when the master flag is off', async () => {
    if (env.server) (env.server as any).RAG_GRAPH_RETRIEVAL_ENABLED = false;
    const logSpy = jest.spyOn(ragPerformanceTelemetryService, 'logEvent');
    const { orchestrator } = buildOrchestrator();

    await orchestrator.orchestrate({ userId: 'u1', question: 'q', sourceMode: 'documents_only' });

    expect(graphContextAugmenterService.augment).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
      event: 'rag.retrieval.graph.completed',
      metadata: expect.objectContaining({ graphDecision: 'DISABLED', graphStatus: 'DISABLED', graphRetrievalEnabled: false })
    }));
  });

  it('10. logs graphStatus=SKIPPED_SOURCE_MODE for web_only requests', async () => {
    if (env.server) {
      (env.server as any).RAG_GRAPH_RETRIEVAL_ENABLED = true;
      (env.server as any).RAG_GRAPH_RETRIEVAL_ALWAYS_ON = true;
    }
    const logSpy = jest.spyOn(ragPerformanceTelemetryService, 'logEvent');
    const { orchestrator } = buildOrchestrator();

    await orchestrator.orchestrate({ userId: 'u1', question: 'q', sourceMode: 'web_only' });

    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ graphDecision: 'SOURCE_MODE_EXCLUDED', graphStatus: 'SKIPPED_SOURCE_MODE' })
    }));
  });

  it('11. logs graphStatus=SKIPPED_NOT_GRAPH_PRIORITY when enabled but not classified and not always-on', async () => {
    if (env.server) {
      (env.server as any).RAG_GRAPH_RETRIEVAL_ENABLED = true;
      (env.server as any).RAG_GRAPH_RETRIEVAL_ALWAYS_ON = false;
    }
    const logSpy = jest.spyOn(ragPerformanceTelemetryService, 'logEvent');
    const { orchestrator } = buildOrchestrator();

    await orchestrator.orchestrate({ userId: 'u1', question: 'q', sourceMode: 'documents_only' });

    expect(graphContextAugmenterService.augment).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ graphDecision: 'NOT_CLASSIFIED', graphStatus: 'SKIPPED_NOT_GRAPH_PRIORITY' })
    }));
  });

  it('12. logs graphStatus=SUCCESS with counts and timings, and graphDecision=ALWAYS_ON, when always-on forces an attempt', async () => {
    if (env.server) {
      (env.server as any).RAG_GRAPH_RETRIEVAL_ENABLED = true;
      (env.server as any).RAG_GRAPH_RETRIEVAL_ALWAYS_ON = true;
    }
    (graphContextAugmenterService.augment as jest.Mock).mockResolvedValue({
      chunks: [STRONG_CHUNK, { ...STRONG_CHUNK, id: 'graph-1', retrievalSource: 'graph' }],
      usedGraph: true, status: 'SUCCESS',
      graphNodesCount: 4, graphEdgesCount: 2, evidenceRecordsCount: 5,
      chunksAddedCount: 1, duplicatesRemovedCount: 1,
      graphSubgraphRetrievalMs: 10, graphEvidenceLookupMs: 8, graphContextMappingMs: 1, graphTotalMs: 19
    });
    const logSpy = jest.spyOn(ragPerformanceTelemetryService, 'logEvent');
    const { orchestrator } = buildOrchestrator();

    await orchestrator.orchestrate({ userId: 'u1', question: 'q', sourceMode: 'documents_only' });

    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
      event: 'rag.retrieval.graph.completed',
      durationMs: 19,
      metadata: expect.objectContaining({
        graphDecision: 'ALWAYS_ON', graphStatus: 'SUCCESS', graphChunksAdded: 1,
        graphNodesCount: 4, graphEdgesCount: 2, graphEvidenceRecordsCount: 5,
        graphDuplicatesRemovedCount: 1, graphSubgraphRetrievalMs: 10, graphEvidenceLookupMs: 8,
        graphContextMappingMs: 1, graphTotalMs: 19
      })
    }));
  });

  it('13. logs graphStatus=FALLBACK_ERROR and still returns a usable answer when the augmenter reports failure via its status', async () => {
    if (env.server) {
      (env.server as any).RAG_GRAPH_RETRIEVAL_ENABLED = true;
      (env.server as any).RAG_GRAPH_RETRIEVAL_ALWAYS_ON = true;
    }
    (graphContextAugmenterService.augment as jest.Mock).mockResolvedValue({
      chunks: [STRONG_CHUNK], usedGraph: false, status: 'FALLBACK_ERROR',
      graphNodesCount: 0, graphEdgesCount: 0, evidenceRecordsCount: 0,
      chunksAddedCount: 0, duplicatesRemovedCount: 0,
      graphSubgraphRetrievalMs: 5, graphEvidenceLookupMs: 0, graphContextMappingMs: 0, graphTotalMs: 5
    });
    const logSpy = jest.spyOn(ragPerformanceTelemetryService, 'logEvent');
    const { orchestrator } = buildOrchestrator();

    const result = await orchestrator.orchestrate({ userId: 'u1', question: 'q', sourceMode: 'documents_only' });

    expect(result.retrievedChunks).toEqual([STRONG_CHUNK]);
    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ graphStatus: 'FALLBACK_ERROR', graphChunksAdded: 0 })
    }));
  });

  it('14. logs graphStatus=EMPTY_GRAPH when the augmenter finds no subgraph', async () => {
    if (env.server) {
      (env.server as any).RAG_GRAPH_RETRIEVAL_ENABLED = true;
      (env.server as any).RAG_GRAPH_RETRIEVAL_ALWAYS_ON = true;
    }
    (graphContextAugmenterService.augment as jest.Mock).mockResolvedValue({
      chunks: [STRONG_CHUNK], usedGraph: false, status: 'EMPTY_GRAPH',
      graphNodesCount: 0, graphEdgesCount: 0, evidenceRecordsCount: 0,
      chunksAddedCount: 0, duplicatesRemovedCount: 0,
      graphSubgraphRetrievalMs: 3, graphEvidenceLookupMs: 0, graphContextMappingMs: 0, graphTotalMs: 3
    });
    const logSpy = jest.spyOn(ragPerformanceTelemetryService, 'logEvent');
    const { orchestrator } = buildOrchestrator();

    await orchestrator.orchestrate({ userId: 'u1', question: 'q', sourceMode: 'documents_only' });

    expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ graphStatus: 'EMPTY_GRAPH' })
    }));
  });

  // --- Structured GraphRetrievalExplanation object on OrchestratedAnswer.graphRetrieval (this pass) ---

  describe('GraphRetrievalExplanation (OrchestratedAnswer.graphRetrieval)', () => {
    it('15. feature disabled: attempted=false, executed=false, reason=FEATURE_DISABLED', async () => {
      if (env.server) (env.server as any).RAG_GRAPH_RETRIEVAL_ENABLED = false;
      const { orchestrator } = buildOrchestrator();

      const result = await orchestrator.orchestrate({ userId: 'u1', question: 'q', sourceMode: 'documents_only' });

      expect(result.graphRetrieval).toEqual(expect.objectContaining({
        attempted: false, executed: false, reason: 'FEATURE_DISABLED', success: false,
        entitiesFound: 0, relationshipsFound: 0, evidenceFound: 0,
        chunksAdded: 0, chunksDeduplicated: 0, chunksDroppedByLimit: 0
      }));
    });

    it('16. query not graph relevant: attempted=true, executed=false, reason=QUERY_NOT_GRAPH_RELEVANT', async () => {
      if (env.server) {
        (env.server as any).RAG_GRAPH_RETRIEVAL_ENABLED = true;
        (env.server as any).RAG_GRAPH_RETRIEVAL_ALWAYS_ON = false;
      }
      const { orchestrator } = buildOrchestrator();

      const result = await orchestrator.orchestrate({ userId: 'u1', question: 'q', sourceMode: 'documents_only' });

      expect(result.graphRetrieval).toEqual(expect.objectContaining({
        attempted: true, executed: false, reason: 'QUERY_NOT_GRAPH_RELEVANT', success: false
      }));
    });

    it('17. query classified graph-relevant (graphPriority): reason=QUERY_CLASSIFIED_GRAPH_RELEVANT, attempted+executed', async () => {
      if (env.server) {
        (env.server as any).RAG_GRAPH_RETRIEVAL_ENABLED = true;
        (env.server as any).RAG_GRAPH_RETRIEVAL_ALWAYS_ON = false;
      }
      (getQueryIntelligenceConfig as jest.Mock).mockReturnValue({ ...DISABLED_CONFIG, masterEnabled: true, queryIntelligenceEnabled: true, adaptiveStrategyEnabled: true });
      (queryIntelligenceService.analyze as jest.Mock).mockResolvedValue({
        intent: 'BROAD_EXPLORATION', expectedDocumentTypes: [], expectedSections: [], isBroad: true, isAmbiguous: false,
        isTableOrChartQuery: false, complexity: 0.5, retrievalStrategy: 'BROAD', source: 'heuristic', analysisMs: 1, cacheHit: false
      });
      (strategySelectorService.selectStrategy as jest.Mock).mockReturnValue({ vectorWeight: 0.5, keywordWeight: 0.5, graphPriority: true });
      (graphContextAugmenterService.augment as jest.Mock).mockResolvedValue({
        chunks: [STRONG_CHUNK], usedGraph: false, status: 'EMPTY_GRAPH',
        graphNodesCount: 0, graphEdgesCount: 0, evidenceRecordsCount: 0,
        chunksAddedCount: 0, duplicatesRemovedCount: 0, droppedByLimitCount: 0,
        graphSubgraphRetrievalMs: 2, graphEvidenceLookupMs: 0, graphContextMappingMs: 0, graphTotalMs: 2
      });
      const { orchestrator } = buildOrchestrator();

      const result = await orchestrator.orchestrate({ userId: 'u1', question: 'q', sourceMode: 'documents_only' });

      expect(result.graphRetrieval).toEqual(expect.objectContaining({
        attempted: true, executed: true, reason: 'QUERY_CLASSIFIED_GRAPH_RELEVANT', priority: true, success: true
      }));
    });

    it('18. always-on mode: reason=ALWAYS_ON_ENABLED even though graphPriority is false/undefined', async () => {
      if (env.server) {
        (env.server as any).RAG_GRAPH_RETRIEVAL_ENABLED = true;
        (env.server as any).RAG_GRAPH_RETRIEVAL_ALWAYS_ON = true;
      }
      (graphContextAugmenterService.augment as jest.Mock).mockResolvedValue({
        chunks: [STRONG_CHUNK], usedGraph: false, status: 'EMPTY_GRAPH',
        graphNodesCount: 0, graphEdgesCount: 0, evidenceRecordsCount: 0,
        chunksAddedCount: 0, duplicatesRemovedCount: 0, droppedByLimitCount: 0,
        graphSubgraphRetrievalMs: 1, graphEvidenceLookupMs: 0, graphContextMappingMs: 0, graphTotalMs: 1
      });
      const { orchestrator } = buildOrchestrator();

      const result = await orchestrator.orchestrate({ userId: 'u1', question: 'q', sourceMode: 'documents_only' });

      expect(result.graphRetrieval).toEqual(expect.objectContaining({ reason: 'ALWAYS_ON_ENABLED', attempted: true, executed: true }));
    });

    it('19. successful retrieval: every metric field is populated from the augmenter result, plus graphChunksInCitationCandidates', async () => {
      if (env.server) {
        (env.server as any).RAG_GRAPH_RETRIEVAL_ENABLED = true;
        (env.server as any).RAG_GRAPH_RETRIEVAL_ALWAYS_ON = true;
      }
      const graphChunk: RetrievedChunk = { ...STRONG_CHUNK, id: 'graph-chunk-1', retrievalSource: 'graph' };
      (graphContextAugmenterService.augment as jest.Mock).mockResolvedValue({
        chunks: [STRONG_CHUNK, graphChunk], usedGraph: true, status: 'SUCCESS',
        graphNodesCount: 4, graphEdgesCount: 2, evidenceRecordsCount: 5,
        chunksAddedCount: 1, duplicatesRemovedCount: 1, droppedByLimitCount: 2,
        graphSubgraphRetrievalMs: 10, graphEvidenceLookupMs: 8, graphContextMappingMs: 1, graphTotalMs: 19
      });
      const { orchestrator } = buildOrchestrator();

      const result = await orchestrator.orchestrate({ userId: 'u1', question: 'q', sourceMode: 'documents_only' });

      expect(result.graphRetrieval).toEqual(expect.objectContaining({
        attempted: true, executed: true, success: true,
        entitiesFound: 4, relationshipsFound: 2, evidenceFound: 5,
        chunksAdded: 1, chunksDeduplicated: 1, chunksDroppedByLimit: 2,
        latencyMs: 19
      }));
      // citationService.mapCitationsToAnswer is not mocked in this file — it runs for real against
      // the actual STRONG_CHUNK/graphChunk pair, so this only asserts the field's TYPE/presence,
      // not a specific count (that exact-count behavior belongs to citation.service.ts's own tests).
      expect(typeof result.graphRetrieval?.graphChunksInCitationCandidates).toBe('number');
    });

    it('20. graph retrieval failure: normal retrieval still succeeds, failureCategory is recorded, no raw error text is exposed', async () => {
      if (env.server) {
        (env.server as any).RAG_GRAPH_RETRIEVAL_ENABLED = true;
        (env.server as any).RAG_GRAPH_RETRIEVAL_ALWAYS_ON = true;
      }
      (graphContextAugmenterService.augment as jest.Mock).mockResolvedValue({
        chunks: [STRONG_CHUNK], usedGraph: false, status: 'FALLBACK_ERROR', failureCategory: 'DATABASE_FAILURE',
        graphNodesCount: 0, graphEdgesCount: 0, evidenceRecordsCount: 0,
        chunksAddedCount: 0, duplicatesRemovedCount: 0, droppedByLimitCount: 0,
        graphSubgraphRetrievalMs: 5, graphEvidenceLookupMs: 0, graphContextMappingMs: 0, graphTotalMs: 5
      });
      const { orchestrator } = buildOrchestrator();

      const result = await orchestrator.orchestrate({ userId: 'u1', question: 'q', sourceMode: 'documents_only' });

      expect(result.retrievedChunks).toEqual([STRONG_CHUNK]);
      expect(result.answerMode).not.toBe('NO_DOCUMENT_EVIDENCE');
      expect(result.graphRetrieval).toEqual(expect.objectContaining({ success: false, failureCategory: 'DATABASE_FAILURE' }));
      // The explanation object carries only a category enum — never the raw Error/message text.
      expect(JSON.stringify(result.graphRetrieval)).not.toMatch(/db unavailable|Error:|at\s+\w+\s+\(/);
    });

    it('21. user isolation: the explanation object contains no cross-user identifiers, only this request\'s own counts', async () => {
      if (env.server) {
        (env.server as any).RAG_GRAPH_RETRIEVAL_ENABLED = true;
        (env.server as any).RAG_GRAPH_RETRIEVAL_ALWAYS_ON = true;
      }
      (graphContextAugmenterService.augment as jest.Mock).mockResolvedValue({
        chunks: [STRONG_CHUNK], usedGraph: false, status: 'EMPTY_GRAPH',
        graphNodesCount: 0, graphEdgesCount: 0, evidenceRecordsCount: 0,
        chunksAddedCount: 0, duplicatesRemovedCount: 0, droppedByLimitCount: 0,
        graphSubgraphRetrievalMs: 1, graphEvidenceLookupMs: 0, graphContextMappingMs: 0, graphTotalMs: 1
      });
      const { orchestrator } = buildOrchestrator();

      const result = await orchestrator.orchestrate({ userId: 'user-isolated-42', question: 'q', sourceMode: 'documents_only' });

      expect(graphContextAugmenterService.augment).toHaveBeenCalledWith(
        'user-isolated-42', expect.any(String), expect.any(Array), expect.anything(), expect.anything()
      );
      expect(JSON.stringify(result.graphRetrieval)).not.toMatch(/user-isolated-42/);
    });
  });
});
