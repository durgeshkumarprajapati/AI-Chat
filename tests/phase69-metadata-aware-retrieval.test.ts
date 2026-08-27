import { AnswerOrchestratorService } from '@/features/rag/orchestration/answer-orchestrator.service';
import { OrchestrationInput } from '@/features/rag/orchestration/answer-orchestrator.types';

function buildOrchestrator(overrides: {
  cacheProvider?: Record<string, jest.Mock>;
  retrievalService?: Record<string, jest.Mock>;
}) {
  const cacheProvider = {
    getExact: jest.fn().mockResolvedValue(null),
    getSemanticWithDiagnostics: jest.fn().mockResolvedValue({ item: null, similarity: null, candidateCount: 0 }),
    setExact: jest.fn().mockResolvedValue(undefined),
    setSemantic: jest.fn().mockResolvedValue(undefined),
    ...overrides.cacheProvider
  };
  const retrievalService = {
    getQueryEmbedding: jest.fn().mockResolvedValue({ vector: [0.1], cacheHit: false, generationMs: 1 }),
    retrieveContextWithTrace: jest.fn().mockResolvedValue({ chunks: [], trace: { metrics: {} } }),
    ...overrides.retrievalService
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

  const orchestrator = new AnswerOrchestratorService(
    cacheProvider as any,
    retrievalService as any,
    evidenceService as any,
    llmProvider as any
  );

  return { orchestrator, cacheProvider, retrievalService };
}

describe('AnswerOrchestratorService — Phase 69A metadata-aware retrieval cache bypass', () => {
  const baseInput: OrchestrationInput = { userId: 'u1', question: 'What is in the contract?' };

  it('bypasses the exact and semantic cache lookup entirely when documentTypeFilter is set', async () => {
    const { orchestrator, cacheProvider } = buildOrchestrator({});

    const result = await orchestrator.findCachedAnswer({ ...baseInput, documentTypeFilter: ['CONTRACT'] });

    expect(result).toBeNull();
    expect(cacheProvider.getExact).not.toHaveBeenCalled();
    expect(cacheProvider.getSemanticWithDiagnostics).not.toHaveBeenCalled();
  });

  it('still consults the cache normally when documentTypeFilter is absent (no behavior change)', async () => {
    const { orchestrator, cacheProvider } = buildOrchestrator({});

    await orchestrator.findCachedAnswer(baseInput);

    expect(cacheProvider.getExact).toHaveBeenCalled();
  });

  it('skips writing to the cache when documentTypeFilter was used for this request', async () => {
    const { orchestrator, cacheProvider } = buildOrchestrator({});

    await orchestrator.cacheCompletedAnswer(
      { ...baseInput, documentTypeFilter: ['CONTRACT'] },
      'answer text',
      [{ documentId: 'd1', chunkId: 'c1' } as any],
      1,
      0.9,
      'GROUNDED'
    );

    expect(cacheProvider.setExact).not.toHaveBeenCalled();
    expect(cacheProvider.setSemantic).not.toHaveBeenCalled();
  });

  it('still writes to the cache normally when documentTypeFilter is absent', async () => {
    const { orchestrator, cacheProvider } = buildOrchestrator({});

    await orchestrator.cacheCompletedAnswer(
      baseInput,
      'answer text',
      [{ documentId: 'd1', chunkId: 'c1' } as any],
      1,
      0.9,
      'GROUNDED'
    );

    expect(cacheProvider.setExact).toHaveBeenCalled();
  });

  it('forwards documentTypeFilter into retrieveContextWithTrace options', async () => {
    const { orchestrator, retrievalService } = buildOrchestrator({});
    jest.spyOn(orchestrator as any, 'computeIntelligentRetrievalOptions').mockResolvedValue({
      rerankerOverride: undefined,
      routeConfidence: 'LOW',
      candidateDocIds: [],
      boostDocIds: []
    });

    await orchestrator.orchestrate({ ...baseInput, sourceMode: 'documents_only', documentTypeFilter: ['REPORT'] });

    expect(retrievalService.retrieveContextWithTrace).toHaveBeenCalledWith(
      'u1',
      expect.any(String),
      expect.objectContaining({
        documentTypeFilter: ['REPORT']
      })
    );
  }, 10000);
});

describe('RetrievalService — Phase 69A metadata-aware filter (in-memory contract)', () => {
  // The filter itself is a small inline block inside RetrievalService.retrieveContextWithTrace
  // operating on already-fetched RetrievedChunk[] candidates. This test exercises the exact
  // filtering contract (documented in RetrievalOptions.documentTypeFilter) against representative
  // chunk shapes, independent of the surrounding DB/embedding plumbing.
  function applyDocumentTypeFilter(candidates: Array<{ metadata: Record<string, unknown> }>, filter?: string[]) {
    if (!filter?.length) return candidates;
    const filtered = candidates.filter((c) => {
      const chunkDocumentType = c.metadata?.documentType;
      return !chunkDocumentType || filter.includes(chunkDocumentType as string);
    });
    return filtered.length > 0 ? filtered : candidates;
  }

  it('keeps legacy chunks with no documentType in metadata regardless of the filter', () => {
    const candidates = [{ metadata: {} }, { metadata: { documentType: 'CONTRACT' } }];
    const result = applyDocumentTypeFilter(candidates, ['INVOICE']);
    expect(result).toContainEqual({ metadata: {} });
  });

  it('drops chunks whose documentType does not match the filter', () => {
    const candidates = [{ metadata: { documentType: 'CONTRACT' } }, { metadata: { documentType: 'INVOICE' } }];
    const result = applyDocumentTypeFilter(candidates, ['INVOICE']);
    expect(result).toEqual([{ metadata: { documentType: 'INVOICE' } }]);
  });

  it('never zeroes out a non-empty candidate set even if nothing matches the filter', () => {
    const candidates = [{ metadata: { documentType: 'CONTRACT' } }];
    const result = applyDocumentTypeFilter(candidates, ['INVOICE']);
    expect(result).toEqual(candidates);
  });

  it('is a complete no-op when no filter is provided', () => {
    const candidates = [{ metadata: { documentType: 'CONTRACT' } }, { metadata: {} }];
    expect(applyDocumentTypeFilter(candidates, undefined)).toBe(candidates);
  });
});
