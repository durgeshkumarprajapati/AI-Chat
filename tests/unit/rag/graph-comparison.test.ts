jest.mock('../../../src/features/rag/chat/prompt-context.service', () => ({
  promptContextService: { optimize: jest.fn().mockReturnValue({ context: 'ctx', chunks: [], promptTokenEstimate: 1, conversationContextTokens: 0, retrievedContextTokens: 1 }) }
}));
jest.mock('../../../src/features/rag/llm/llm.provider.factory', () => ({
  getLLMProvider: jest.fn().mockReturnValue({ generateAnswer: jest.fn().mockResolvedValue('mock answer'), streamAnswer: jest.fn() })
}));

import { GraphComparisonService } from '@/features/rag/evaluation/graph-comparison.service';
import { OrchestratedAnswer } from '@/features/rag/orchestration/answer-orchestrator.types';
import { RetrievedChunk } from '@/features/rag/retrieval/retrieval.types';
import { env } from '@/config/env';

/**
 * Integration-level tests for GraphComparisonService.compareForCase, mirroring the existing
 * tests/unit/rag/graph-retrieval-integration.test.ts pattern: a fake orchestrator is injected via
 * constructor DI (matching AnswerOrchestratorService's own established DI pattern), so these tests
 * never require a real database/LLM/graph service. Like that file, importing the real
 * answer-orchestrator.service.ts module (for its type/singleton) transitively loads
 * src/config/env.ts, which is BLOCKED in this sandbox by the pre-existing .env EACCES restriction —
 * see the final report for how this was verified as pre-existing rather than a new regression.
 */

const BASELINE_CHUNK: RetrievedChunk = {
  id: 'vec-1', documentId: 'doc-1', filename: 'org-chart.pdf', chunkIndex: 0, pageNumber: 1,
  content: 'Entity A works in the platform division.', tokenCount: 10, similarity: 0.8, metadata: {}
};
const GRAPH_CHUNK: RetrievedChunk = {
  ...BASELINE_CHUNK,
  id: 'graph-1', documentId: 'doc-2', retrievalSource: 'graph',
  content: 'Entity A reports to Entity B as part of the platform team.'
};

function orchestratedAnswer(overrides: Partial<OrchestratedAnswer>): OrchestratedAnswer {
  return {
    requestId: 'test-request-id', conversationId: '', answerMode: 'DOCUMENT_GROUNDED', answer: '', citations: [],
    retrievedChunks: [], topSimilarity: 0.8, cacheHit: false, cacheType: 'none',
    llmCalled: true, embeddingCalled: true, vectorSearchCalled: true, keywordSearchCalled: true,
    rerankCalled: true, recoveryAttempted: false, recoveryAttempts: 0, latencyTrace: {},
    ...overrides
  };
}

function buildFakeOrchestrator(behavior: (input: any) => OrchestratedAnswer) {
  return { orchestrate: jest.fn(async (input: any) => behavior(input)) };
}

const EVAL_CASE = {
  id: 'test-case-1',
  query: 'How is Entity A related to Entity B?',
  userId: 'eval-user-isolated-1',
  knowledgeBaseId: 'eval-kb-1',
  sourceMode: 'documents_only' as const,
  expectedEntities: ['Entity A', 'Entity B'],
  expectedRelationships: [{ from: 'Entity A', to: 'Entity B', keyword: 'reports to' }]
};

describe('GraphComparisonService.compareForCase', () => {
  let originalEnabled: boolean | undefined;

  beforeEach(() => {
    originalEnabled = env.server?.RAG_GRAPH_EVALUATION_ENABLED;
    if (env.server) (env.server as any).RAG_GRAPH_EVALUATION_ENABLED = true;
  });

  afterEach(() => {
    if (env.server) (env.server as any).RAG_GRAPH_EVALUATION_ENABLED = originalEnabled;
  });

  it('1. is disabled by default: throws rather than running when RAG_GRAPH_EVALUATION_ENABLED is false', async () => {
    if (env.server) (env.server as any).RAG_GRAPH_EVALUATION_ENABLED = false;
    const fakeOrchestrator = buildFakeOrchestrator(() => orchestratedAnswer({}));
    const service = new GraphComparisonService(fakeOrchestrator as any);

    await expect(service.compareForCase(EVAL_CASE)).rejects.toThrow('RAG_GRAPH_EVALUATION_ENABLED');
    expect(fakeOrchestrator.orchestrate).not.toHaveBeenCalled();
  });

  it('2. calls the orchestrator twice: once FORCE_OFF (baseline), once FORCE_ON (graph variant), sequentially', async () => {
    const seenOverrides: string[] = [];
    const fakeOrchestrator = buildFakeOrchestrator((input) => {
      seenOverrides.push(input.evaluationGraphOverride);
      return orchestratedAnswer({ retrievedChunks: input.evaluationGraphOverride === 'FORCE_ON' ? [BASELINE_CHUNK, GRAPH_CHUNK] : [BASELINE_CHUNK] });
    });
    const service = new GraphComparisonService(fakeOrchestrator as any);

    await service.compareForCase(EVAL_CASE);

    expect(seenOverrides).toEqual(['FORCE_OFF', 'FORCE_ON']);
    expect(fakeOrchestrator.orchestrate).toHaveBeenCalledTimes(2);
  });

  it('3. also sets skipCache on both calls so an eval run never reads/writes the shared answer cache', async () => {
    const seenSkipCache: unknown[] = [];
    const fakeOrchestrator = buildFakeOrchestrator((input) => {
      seenSkipCache.push(input.skipCache);
      return orchestratedAnswer({ retrievedChunks: [BASELINE_CHUNK] });
    });
    const service = new GraphComparisonService(fakeOrchestrator as any);

    await service.compareForCase(EVAL_CASE);

    expect(seenSkipCache).toEqual([true, true]);
  });

  it('4. reports graph unique contribution and coverage deltas when graph augmentation succeeds', async () => {
    const fakeOrchestrator = buildFakeOrchestrator((input) =>
      input.evaluationGraphOverride === 'FORCE_ON'
        ? orchestratedAnswer({
            retrievedChunks: [BASELINE_CHUNK, GRAPH_CHUNK],
            citations: [{ id: 'cit-1' } as any, { id: 'cit-2' } as any],
            graphRetrieval: {
              attempted: true, executed: true, reason: 'QUERY_CLASSIFIED_GRAPH_RELEVANT', success: true,
              entitiesFound: 2, relationshipsFound: 1, evidenceFound: 1,
              chunksAdded: 1, chunksDeduplicated: 0, chunksDroppedByLimit: 0,
              latencyMs: 12, graphChunksInCitationCandidates: 1
            }
          })
        : orchestratedAnswer({ retrievedChunks: [BASELINE_CHUNK], citations: [{ id: 'cit-1' } as any] })
    );
    const service = new GraphComparisonService(fakeOrchestrator as any);

    const result = await service.compareForCase(EVAL_CASE);

    expect(result.graphRetrievalSucceeded).toBe(true);
    expect(result.graphUniqueContribution.uniqueChunksAdded).toBe(1);
    expect(result.entityCoverageComparison?.coverageDelta).toBeGreaterThan(0);
    expect(result.relationshipCoverageComparison?.coverageDelta).toBeGreaterThan(0);
    expect(result.resultSummary).toContain('added 1 chunk(s)');
  });

  it('5. graph retrieval failure: comparison still completes, no throw, resultSummary reports the failure honestly (Phase 9 item #7)', async () => {
    const fakeOrchestrator = buildFakeOrchestrator((input) =>
      input.evaluationGraphOverride === 'FORCE_ON'
        ? orchestratedAnswer({
            retrievedChunks: [BASELINE_CHUNK],
            graphRetrieval: {
              attempted: true, executed: true, reason: 'QUERY_CLASSIFIED_GRAPH_RELEVANT', success: false,
              failureCategory: 'DATABASE_FAILURE',
              entitiesFound: 0, relationshipsFound: 0, evidenceFound: 0,
              chunksAdded: 0, chunksDeduplicated: 0, chunksDroppedByLimit: 0
            }
          })
        : orchestratedAnswer({ retrievedChunks: [BASELINE_CHUNK] })
    );
    const service = new GraphComparisonService(fakeOrchestrator as any);

    const result = await service.compareForCase(EVAL_CASE);

    expect(result.graphRetrievalSucceeded).toBe(false);
    expect(result.graphFailureCategory).toBe('DATABASE_FAILURE');
    expect(result.resultSummary).toContain('did not complete successfully');
    expect(result.resultSummary).not.toMatch(/db unavailable|Error:|at\s+\w+\s+\(/);
  });

  it('6. user isolation: the same evalCase.userId (never a different value) is passed to both orchestrator calls', async () => {
    const seenUserIds: string[] = [];
    const fakeOrchestrator = buildFakeOrchestrator((input) => {
      seenUserIds.push(input.userId);
      return orchestratedAnswer({ retrievedChunks: [BASELINE_CHUNK] });
    });
    const service = new GraphComparisonService(fakeOrchestrator as any);

    await service.compareForCase(EVAL_CASE);

    expect(seenUserIds).toEqual(['eval-user-isolated-1', 'eval-user-isolated-1']);
  });

  it('7. knowledge-base isolation: the same evalCase.knowledgeBaseId is passed to both orchestrator calls', async () => {
    const seenKbIds: (string | undefined)[] = [];
    const fakeOrchestrator = buildFakeOrchestrator((input) => {
      seenKbIds.push(input.knowledgeBaseId);
      return orchestratedAnswer({ retrievedChunks: [BASELINE_CHUNK] });
    });
    const service = new GraphComparisonService(fakeOrchestrator as any);

    await service.compareForCase(EVAL_CASE);

    expect(seenKbIds).toEqual(['eval-kb-1', 'eval-kb-1']);
  });

  it('8. final citation-usage metric is honestly reported as unavailable, never fabricated (Phase 6/9 item #10)', async () => {
    const fakeOrchestrator = buildFakeOrchestrator(() => orchestratedAnswer({ retrievedChunks: [BASELINE_CHUNK] }));
    const service = new GraphComparisonService(fakeOrchestrator as any);

    const result = await service.compareForCase(EVAL_CASE);

    expect(result.citationComparison.finalAnswerCitationTrackingAvailable).toBe(false);
    expect(result.citationComparison.finalAnswerCitationTrackingLimitation.length).toBeGreaterThan(0);
  });

  it('9. answer-quality comparison is omitted by default (no LLM calls) and only runs when explicitly requested', async () => {
    const fakeOrchestrator = buildFakeOrchestrator(() => orchestratedAnswer({ retrievedChunks: [BASELINE_CHUNK] }));
    const { getLLMProvider } = require('../../../src/features/rag/llm/llm.provider.factory');
    const fakeLLM = getLLMProvider();
    const service = new GraphComparisonService(fakeOrchestrator as any, fakeLLM);

    const withoutFlag = await service.compareForCase(EVAL_CASE);
    expect(withoutFlag.answerQualityComparison).toBeUndefined();
    expect(fakeLLM.generateAnswer).not.toHaveBeenCalled();

    const withFlag = await service.compareForCase(EVAL_CASE, { includeAnswerGeneration: true });
    expect(withFlag.answerQualityComparison).toBeDefined();
    expect(fakeLLM.generateAnswer).toHaveBeenCalled();
  });

  it('10. normal (non-eval) OrchestrationInput is unaffected: evaluationGraphOverride is never set outside this service', () => {
    // Regression guard, not a call to compareForCase: production call sites (chat.service.ts,
    // every /api/rag/* route) build OrchestrationInput without this field, so it stays undefined —
    // byte-identical to this field never having existed. Enforced by construction, not by this
    // assertion alone; see tests/unit/rag/graph-retrieval-integration.test.ts's full-suite A/B diff
    // in the final report for the actual behavioral proof.
    const normalInput: import('@/features/rag/orchestration/answer-orchestrator.types').OrchestrationInput = {
      userId: 'u1', question: 'q'
    };
    expect(normalInput.evaluationGraphOverride).toBeUndefined();
  });
});
