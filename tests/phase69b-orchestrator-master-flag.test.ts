jest.mock('@/features/rag/query-intelligence', () => ({
  queryIntelligenceService: { analyze: jest.fn() },
  documentRoutingService: { route: jest.fn() },
  strategySelectorService: { selectStrategy: jest.fn() },
  dynamicTopKService: { compute: jest.fn() },
  IntelligenceAwareReranker: jest.fn(),
  getQueryIntelligenceConfig: jest.fn(),
  queryIntelligenceTelemetryService: { logEvent: jest.fn() }
}));

import {
  getQueryIntelligenceConfig,
  queryIntelligenceService,
  documentRoutingService,
  dynamicTopKService
} from '@/features/rag/query-intelligence';
import { AnswerOrchestratorService } from '@/features/rag/orchestration/answer-orchestrator.service';

const DISABLED_CONFIG = {
  masterEnabled: false,
  queryIntelligenceEnabled: false,
  queryRoutingEnabled: false,
  metadataRetrievalEnabled: false,
  sectionAwareRetrievalEnabled: false,
  adaptiveStrategyEnabled: false,
  dynamicTopKEnabled: false,
  advancedRerankingEnabled: false,
  queryIntelligenceTimeoutMs: 3000,
  minCandidateK: 10,
  maxCandidateK: 40,
  minFinalK: 5,
  maxFinalK: 15,
  rerankWeights: {} as any
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
    retrieveContextWithTrace: jest.fn().mockResolvedValue({ chunks: [], trace: { metrics: {} } })
  };
  const evidenceService = {
    assessEvidence: jest.fn().mockReturnValue({
      hasStrongEvidence: false,
      retrievedChunkCount: 0,
      topSimilarity: 0,
      avgSimilarity: 0,
      isAmbiguousQuestion: false
    })
  };
  const llmProvider = { generateAnswer: jest.fn(), streamAnswer: jest.fn() };

  const orchestrator = new AnswerOrchestratorService(cacheProvider as any, retrievalService as any, evidenceService as any, llmProvider as any);
  return { orchestrator, retrievalService };
}

describe('AnswerOrchestratorService — Phase 69B master-flag gating', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is byte-identical to pre-69B behavior when the master flag is disabled', async () => {
    (getQueryIntelligenceConfig as jest.Mock).mockReturnValue(DISABLED_CONFIG);
    const { orchestrator, retrievalService } = buildOrchestrator();

    await orchestrator.orchestrate({ userId: 'u1', question: 'What is in the report?', sourceMode: 'documents_only' });

    expect(queryIntelligenceService.analyze).not.toHaveBeenCalled();
    expect(retrievalService.retrieveContextWithTrace).toHaveBeenCalledWith(
      'u1',
      expect.any(String),
      expect.objectContaining({
        knowledgeBaseId: undefined,
        sourceMode: 'documents_only',
        documentTypeFilter: undefined
      })
    );
    const callArgs = (retrievalService.retrieveContextWithTrace as jest.Mock).mock.calls[0][2];
    expect(callArgs.documentIdFilter).toBeUndefined();
    expect(callArgs.vectorK).toBeUndefined();
    expect(callArgs.topK).toBeUndefined();
  });

  it('applies overrides when the master flag and sub-flags are enabled', async () => {
    (getQueryIntelligenceConfig as jest.Mock).mockReturnValue({
      ...DISABLED_CONFIG,
      masterEnabled: true,
      queryIntelligenceEnabled: true,
      queryRoutingEnabled: true,
      metadataRetrievalEnabled: true,
      dynamicTopKEnabled: true
    });
    (queryIntelligenceService.analyze as jest.Mock).mockResolvedValue({
      intent: 'FACTUAL',
      expectedDocumentTypes: ['REPORT'],
      expectedSections: [],
      isBroad: false,
      isAmbiguous: false,
      isTableOrChartQuery: false,
      complexity: 0.5,
      retrievalStrategy: 'BALANCED',
      source: 'heuristic',
      analysisMs: 1,
      cacheHit: false
    });
    (documentRoutingService.route as jest.Mock).mockResolvedValue({
      confidence: 'HIGH',
      candidateDocumentIds: ['doc-1'],
      boostDocumentIds: []
    });
    (dynamicTopKService.compute as jest.Mock).mockReturnValue({ candidateK: 25, finalK: 8 });

    const { orchestrator, retrievalService } = buildOrchestrator();

    await orchestrator.orchestrate({ userId: 'u1', question: 'What is in the report?', sourceMode: 'documents_only' });

    const callArgs = (retrievalService.retrieveContextWithTrace as jest.Mock).mock.calls[0][2];
    expect(callArgs.documentIdFilter).toEqual(['doc-1']);
    expect(callArgs.documentTypeFilter).toEqual(['REPORT']);
    expect(callArgs.vectorK).toBe(25);
    expect(callArgs.topK).toBe(8);
  });

  it('never throws even if computeIntelligentRetrievalOptions fails internally', async () => {
    (getQueryIntelligenceConfig as jest.Mock).mockReturnValue({ ...DISABLED_CONFIG, masterEnabled: true, queryIntelligenceEnabled: true });
    (queryIntelligenceService.analyze as jest.Mock).mockRejectedValue(new Error('boom'));

    const { orchestrator, retrievalService } = buildOrchestrator();

    await expect(
      orchestrator.orchestrate({ userId: 'u1', question: 'What is in the report?', sourceMode: 'documents_only' })
    ).resolves.toBeDefined();

    expect(retrievalService.retrieveContextWithTrace).toHaveBeenCalled();
  });
});
