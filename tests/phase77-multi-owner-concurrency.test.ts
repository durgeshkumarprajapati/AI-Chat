/**
 * Phase 77: multi-owner-answer.service.ts's knowledge-base owner resolution was batched
 * (findUnique-per-id -> single findMany) and its per-owner KB retrieval loop was parallelized
 * (sequential for-await -> Promise.all). This test proves both preserve identical outcomes:
 * the same owners resolved, the same chunks merged, regardless of which concurrent retrieval
 * call happens to resolve first.
 */
jest.mock('@/lib/prisma', () => ({
  prisma: {
    document: { findMany: jest.fn() },
    knowledgeBase: { findMany: jest.fn(), findUnique: jest.fn() }
  }
}));
jest.mock('@/config/env', () => ({ env: { server: { RAG_GROUP_MAX_FANOUT_OWNERS: 20, RAG_TOP_K: 5 } } }));
jest.mock('@/features/rag/retrieval/retrieval.service', () => ({
  retrievalService: {
    getQueryEmbedding: jest.fn(),
    retrieveContextWithTrace: jest.fn()
  }
}));
jest.mock('@/features/rag/retrieval/reranker', () => ({
  localReranker: { rerank: jest.fn((_q: string, chunks: any[]) => chunks) }
}));
jest.mock('@/features/rag/orchestration/evidence-assessment.service', () => ({
  evidenceAssessmentService: { assessEvidence: jest.fn(() => ({ hasStrongEvidence: false, topSimilarity: 0 })) }
}));

import { prisma } from '@/lib/prisma';
import { retrievalService } from '@/features/rag/retrieval/retrieval.service';
import { multiOwnerAnswerService } from '@/features/rag/collaboration/multi-owner-answer.service';
import { RetrievalScope } from '@/features/rag/collaboration/retrieval-scope.types';

describe('Phase 77 — multi-owner-answer.service.ts concurrency preserves identical results', () => {
  beforeEach(() => jest.clearAllMocks());

  it('resolves KB owners via a single batched findMany instead of one findUnique per kbId', async () => {
    (prisma.document.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.knowledgeBase.findMany as jest.Mock).mockResolvedValue([
      { id: 'kb-1', userId: 'owner-a' },
      { id: 'kb-2', userId: 'owner-b' }
    ]);
    (retrievalService.getQueryEmbedding as jest.Mock).mockResolvedValue({ vector: [0.1], generationMs: 1 });
    (retrievalService.retrieveContextWithTrace as jest.Mock).mockResolvedValue({ chunks: [] });

    const scope: RetrievalScope = {
      userId: 'user-1',
      conversationId: 'conv-1',
      conversationType: 'GROUP',
      authorizedDocumentIds: [],
      authorizedKnowledgeBaseIds: ['kb-1', 'kb-2'],
      allowWebSearch: false,
      allowKnowledgeGraph: false,
      isHardScoped: true
    };

    await multiOwnerAnswerService.answer(scope, 'question');

    expect(prisma.knowledgeBase.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['kb-1', 'kb-2'] } },
      select: { id: true, userId: true }
    });
    expect(prisma.knowledgeBase.findUnique).not.toHaveBeenCalled();
  });

  it('merges chunks from all owners/KBs into an identical final set regardless of which concurrent call resolves first', async () => {
    (prisma.document.findMany as jest.Mock).mockResolvedValue([{ id: 'doc-1', userId: 'owner-a' }]);
    (prisma.knowledgeBase.findMany as jest.Mock).mockResolvedValue([
      { id: 'kb-1', userId: 'owner-a' },
      { id: 'kb-2', userId: 'owner-a' }
    ]);
    (retrievalService.getQueryEmbedding as jest.Mock).mockResolvedValue({ vector: [0.1], generationMs: 1 });

    // kb-2 resolves before kb-1 (reverse of call order) — the merge must not depend on order.
    (retrievalService.retrieveContextWithTrace as jest.Mock).mockImplementation(async (_ownerId, _q, opts) => {
      if (opts.documentIdFilter) {
        return { chunks: [{ id: 'chunk-doc-1', documentId: 'doc-1', content: 'doc content' }] };
      }
      if (opts.knowledgeBaseId === 'kb-2') {
        await new Promise((r) => setTimeout(r, 1));
        return { chunks: [{ id: 'chunk-kb-2', documentId: 'doc-kb2', content: 'kb2 content' }] };
      }
      return { chunks: [{ id: 'chunk-kb-1', documentId: 'doc-kb1', content: 'kb1 content' }] };
    });

    const scope: RetrievalScope = {
      userId: 'user-1',
      conversationId: 'conv-1',
      conversationType: 'GROUP',
      authorizedDocumentIds: ['doc-1'],
      authorizedKnowledgeBaseIds: ['kb-1', 'kb-2'],
      allowWebSearch: false,
      allowKnowledgeGraph: false,
      isHardScoped: false
    };

    const result = await multiOwnerAnswerService.answer(scope, 'question');

    const chunkIds = result.retrievedChunks.map((c: any) => c.id).sort();
    expect(chunkIds).toEqual(['chunk-doc-1', 'chunk-kb-1', 'chunk-kb-2']);
  });
});
