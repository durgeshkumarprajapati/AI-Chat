jest.mock('@/features/rag/collaboration/scope-resolver.service', () => ({
  scopeResolverService: { resolveScope: jest.fn() }
}));
jest.mock('@/features/rag/orchestration/answer-orchestrator.service', () => ({
  answerOrchestratorService: { orchestrate: jest.fn() }
}));
jest.mock('@/features/rag/collaboration/multi-owner-answer.service', () => ({
  multiOwnerAnswerService: { answer: jest.fn() }
}));

import { scopeResolverService } from '@/features/rag/collaboration/scope-resolver.service';
import { answerOrchestratorService } from '@/features/rag/orchestration/answer-orchestrator.service';
import { multiOwnerAnswerService } from '@/features/rag/collaboration/multi-owner-answer.service';
import { ragCollaborationOrchestratorService } from '@/features/rag/collaboration/rag-collaboration-orchestrator.service';
import { RetrievalScope } from '@/features/rag/collaboration/retrieval-scope.types';

function baseAnswer(overrides: Record<string, unknown> = {}) {
  return {
    conversationId: 'conv-1',
    answerMode: 'DOCUMENT_GROUNDED',
    answer: 'answer text',
    citations: [{ documentId: 'doc-1', chunkId: 'c1', filename: 'f', pageNumber: 1, similarity: 0.9 }],
    retrievedChunks: [{ id: 'c1', documentId: 'doc-1', filename: 'f', chunkIndex: 0, pageNumber: 1, content: 'x', tokenCount: 1, similarity: 0.9, metadata: {} }],
    topSimilarity: 0.9,
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

const privateScope: RetrievalScope = {
  userId: 'user-1',
  conversationId: 'conv-1',
  conversationType: 'PRIVATE',
  authorizedDocumentIds: undefined,
  authorizedKnowledgeBaseIds: undefined,
  allowWebSearch: true,
  allowKnowledgeGraph: false,
  isHardScoped: false
};

describe('RagCollaborationOrchestratorService — Phase 71A', () => {
  beforeEach(() => jest.clearAllMocks());

  it('authorization strictly precedes retrieval: a denied scope never reaches orchestrate or the fan-out service', async () => {
    (scopeResolverService.resolveScope as jest.Mock).mockRejectedValue(new Error('Access denied'));

    await expect(
      ragCollaborationOrchestratorService.orchestrateForConversation('user-2', 'conv-1', 'q')
    ).rejects.toThrow();

    expect(answerOrchestratorService.orchestrate).not.toHaveBeenCalled();
    expect(multiOwnerAnswerService.answer).not.toHaveBeenCalled();
  });

  it('PRIVATE delegates directly to the existing answerOrchestratorService.orchestrate()', async () => {
    (scopeResolverService.resolveScope as jest.Mock).mockResolvedValue(privateScope);
    (answerOrchestratorService.orchestrate as jest.Mock).mockResolvedValue(baseAnswer());

    const result = await ragCollaborationOrchestratorService.orchestrateForConversation('user-1', 'conv-1', 'q');

    expect(answerOrchestratorService.orchestrate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', question: 'q', conversationId: 'conv-1' })
    );
    expect(multiOwnerAnswerService.answer).not.toHaveBeenCalled();
    expect(result.answer).toBe('answer text');
  });

  it('an empty authorized-document set short-circuits to a zero-result answer without calling orchestrate or the fan-out service', async () => {
    const emptyScope: RetrievalScope = { ...privateScope, conversationType: 'PROJECT', isHardScoped: true, authorizedDocumentIds: [] };
    (scopeResolverService.resolveScope as jest.Mock).mockResolvedValue(emptyScope);

    const result = await ragCollaborationOrchestratorService.orchestrateForConversation('user-1', 'conv-1', 'q');

    expect(answerOrchestratorService.orchestrate).not.toHaveBeenCalled();
    expect(multiOwnerAnswerService.answer).not.toHaveBeenCalled();
    expect(result.retrievedChunks).toEqual([]);
    expect(result.citations).toEqual([]);
  });

  it('GROUP/PROJECT delegates to the multi-owner fan-out service, not answerOrchestratorService', async () => {
    const groupScope: RetrievalScope = {
      ...privateScope,
      conversationType: 'GROUP',
      isHardScoped: true,
      authorizedDocumentIds: ['doc-1', 'doc-2']
    };
    (scopeResolverService.resolveScope as jest.Mock).mockResolvedValue(groupScope);
    (multiOwnerAnswerService.answer as jest.Mock).mockResolvedValue(
      baseAnswer({
        citations: [
          { documentId: 'doc-1', chunkId: 'c1', filename: 'f', pageNumber: 1, similarity: 0.9 },
          { documentId: 'doc-3', chunkId: 'c3', filename: 'f3', pageNumber: 1, similarity: 0.5 }
        ],
        retrievedChunks: [
          { id: 'c1', documentId: 'doc-1', filename: 'f', chunkIndex: 0, pageNumber: 1, content: 'x', tokenCount: 1, similarity: 0.9, metadata: {} },
          { id: 'c3', documentId: 'doc-3', filename: 'f3', chunkIndex: 0, pageNumber: 1, content: 'y', tokenCount: 1, similarity: 0.5, metadata: {} }
        ]
      })
    );

    const result = await ragCollaborationOrchestratorService.orchestrateForConversation('user-1', 'conv-1', 'q');

    expect(multiOwnerAnswerService.answer).toHaveBeenCalledWith(groupScope, 'q');
    expect(answerOrchestratorService.orchestrate).not.toHaveBeenCalled();
    // Post-hoc hard re-filter: doc-3 was not in authorizedDocumentIds, so it must be stripped
    // even though it slipped through the fan-out service's own (soft, internal) filtering.
    expect(result.retrievedChunks.map((c: { documentId: string }) => c.documentId)).toEqual(['doc-1']);
    expect(result.citations.map((c: { documentId: string }) => c.documentId)).toEqual(['doc-1']);
  });
});
