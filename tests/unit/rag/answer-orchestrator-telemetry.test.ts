jest.mock('@/config/env', () => ({
  env: { server: {} }
}));
jest.mock('@/features/rag/query-intelligence', () => ({
  queryIntelligenceService: { analyze: jest.fn() },
  documentRoutingService: { route: jest.fn() },
  strategySelectorService: { selectStrategy: jest.fn() },
  dynamicTopKService: { compute: jest.fn() },
  IntelligenceAwareReranker: jest.fn(),
  getQueryIntelligenceConfig: jest.fn().mockReturnValue({
    masterEnabled: false, queryIntelligenceEnabled: false, queryRoutingEnabled: false,
    metadataRetrievalEnabled: false, sectionAwareRetrievalEnabled: false, adaptiveStrategyEnabled: false,
    dynamicTopKEnabled: false, advancedRerankingEnabled: false, queryIntelligenceTimeoutMs: 3000,
    minCandidateK: 10, maxCandidateK: 40, minFinalK: 5, maxFinalK: 15, rerankWeights: {}
  }),
  queryIntelligenceTelemetryService: { logEvent: jest.fn() }
}));

import { AnswerOrchestratorService } from '@/features/rag/orchestration/answer-orchestrator.service';
import { ragPerformanceTelemetryService } from '@/features/rag/performance/rag-telemetry.service';
import { RetrievedChunk } from '@/features/rag/retrieval/retrieval.types';

/**
 * Tests the observability-hardening pass's new correlation ID (Phase 3) and rag.retrieval.completed
 * event (Phase 4) directly against the real AnswerOrchestratorService, using the established
 * jest.mock('@/config/env') pattern (see chat-service-evidence.test.ts) so this actually runs in
 * this sandbox rather than being blocked by the pre-existing .env restriction.
 */

const STRONG_CHUNK: RetrievedChunk = {
  id: 'chunk-1', documentId: 'doc-1', filename: 'doc.pdf', chunkIndex: 0, pageNumber: 1,
  content: 'Strong evidence content matching the question well enough to pass evidence assessment.',
  tokenCount: 20, similarity: 0.95, metadata: {}
};

function buildOrchestrator(chunks: RetrievedChunk[]) {
  const cacheProvider = {
    getExact: jest.fn().mockResolvedValue(null),
    getSemanticWithDiagnostics: jest.fn().mockResolvedValue({ item: null, similarity: null, candidateCount: 0 }),
    setExact: jest.fn().mockResolvedValue(undefined),
    setSemantic: jest.fn().mockResolvedValue(undefined)
  };
  const retrievalService = {
    getQueryEmbedding: jest.fn().mockResolvedValue({ vector: [0.1], cacheHit: false, generationMs: 1 }),
    retrieveContextWithTrace: jest.fn().mockResolvedValue({ chunks, trace: { metrics: {} } })
  };
  const evidenceService = {
    assessEvidence: jest.fn().mockReturnValue({
      hasStrongEvidence: chunks.length > 0, retrievedChunkCount: chunks.length, topSimilarity: 0.95,
      avgSimilarity: 0.95, isAmbiguousQuestion: false
    })
  };
  const llmProvider = { generateAnswer: jest.fn(), streamAnswer: jest.fn() };
  return new AnswerOrchestratorService(cacheProvider as any, retrievalService as any, evidenceService as any, llmProvider as any);
}

describe('AnswerOrchestratorService — observability (requestId + rag.retrieval.completed)', () => {
  it('1. requestId is generated once and consistently used by both the returned answer and its own telemetry', async () => {
    const logSpy = jest.spyOn(ragPerformanceTelemetryService, 'logEvent');
    const orchestrator = buildOrchestrator([STRONG_CHUNK]);

    const result = await orchestrator.orchestrate({ userId: 'u1', question: 'What is in the report?', sourceMode: 'documents_only' });

    expect(result.requestId).toEqual(expect.any(String));
    const startedCall = logSpy.mock.calls.find((c) => c[0].event === 'rag.request.started');
    expect(startedCall?.[0].requestId).toBe(result.requestId);
    const retrievalCall = logSpy.mock.calls.find((c) => c[0].event === 'rag.retrieval.completed');
    expect(retrievalCall?.[0].requestId).toBe(result.requestId);
  });

  it('2. rag.retrieval.completed reports the correct chunk count and sourceMode', async () => {
    const logSpy = jest.spyOn(ragPerformanceTelemetryService, 'logEvent');
    const orchestrator = buildOrchestrator([STRONG_CHUNK]);

    await orchestrator.orchestrate({ userId: 'u1', question: 'q', sourceMode: 'documents_only' });

    const retrievalCall = logSpy.mock.calls.find((c) => c[0].event === 'rag.retrieval.completed');
    expect(retrievalCall?.[0].metadata).toMatchObject({ sourceMode: 'documents_only', retrievedChunkCount: 1, isEmpty: false });
  });

  it('reports isEmpty:true when retrieval returns zero chunks (how often retrieval returns nothing)', async () => {
    const logSpy = jest.spyOn(ragPerformanceTelemetryService, 'logEvent');
    const orchestrator = buildOrchestrator([]);

    await orchestrator.orchestrate({ userId: 'u1', question: 'q', sourceMode: 'documents_only' });

    const retrievalCall = logSpy.mock.calls.find((c) => c[0].event === 'rag.retrieval.completed');
    expect(retrievalCall?.[0].metadata).toMatchObject({ retrievedChunkCount: 0, isEmpty: true });
  });

  it('7. telemetry metadata never contains the raw user question', async () => {
    const logSpy = jest.spyOn(ragPerformanceTelemetryService, 'logEvent');
    const orchestrator = buildOrchestrator([STRONG_CHUNK]);
    const sensitiveQuestion = 'What is the secret project codename Falcon-9000?';

    await orchestrator.orchestrate({ userId: 'u1', question: sensitiveQuestion, sourceMode: 'documents_only' });

    for (const call of logSpy.mock.calls) {
      expect(JSON.stringify(call[0])).not.toContain('Falcon-9000');
    }
  });

  it('11. telemetry metadata never contains the raw userId', async () => {
    const logSpy = jest.spyOn(ragPerformanceTelemetryService, 'logEvent');
    const orchestrator = buildOrchestrator([STRONG_CHUNK]);

    await orchestrator.orchestrate({ userId: 'user-should-not-leak-42', question: 'q', sourceMode: 'documents_only' });

    for (const call of logSpy.mock.calls) {
      expect(JSON.stringify(call[0])).not.toContain('user-should-not-leak-42');
    }
  });
});
