import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { retrievalService } from '@/features/rag/retrieval/retrieval.service';
import { conversationContextService } from '@/features/rag/chat/conversation-context.service';
import { AppError } from '@/errors';
import { answerOrchestratorService } from '@/features/rag/orchestration/answer-orchestrator.service';
import { env } from '@/config/env';

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));

    if (!body || typeof body.question !== 'string' || body.question.trim() === '') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Question parameter is required and must be a non-empty string.' } },
        { status: 400 }
      );
    }

    const originalQuestion = body.question.trim();
    const classification = conversationContextService.classifyQuery(originalQuestion);
    let retrievalQuery = originalQuestion;
    let conversationContextDiagnostics = null;
    const loadStart = Date.now();

    if (body.conversationId) {
      const convContext = await conversationContextService.loadConversationContext(
        authUser.id,
        body.conversationId,
        originalQuestion
      );
      retrievalQuery = convContext.retrievalQuery;
      conversationContextDiagnostics = {
        conversationId: body.conversationId,
        includedMessagesCount: convContext.includedMessages.length,
        excludedMessagesCount: convContext.excludedMessageCount,
        hasSummary: !!convContext.summary,
        estimatedTokens: convContext.estimatedTokens,
        contextLoadMs: Date.now() - loadStart
      };
    }

    const sourceMode = body.sourceMode || 'documents_only';
    const targetWebsite = body.targetWebsite || null;
    const allowedSources = body.allowedSources || ['wikipedia', 'medium'];

    const cacheStart = Date.now();
    const cached = classification === 'STANDALONE'
      ? await answerOrchestratorService.findCachedAnswer({
        userId: authUser.id, question: originalQuestion, knowledgeBaseId: body.knowledgeBaseId,
        conversationId: body.conversationId, sourceMode, targetWebsite, allowedSources,
        model: env.server?.LLM_PROVIDER || 'ollama'
      })
      : null;
    const cacheLookupMs = Date.now() - cacheStart;

    let result = { chunks: [] as any[], trace: { metrics: { embeddingMs: 0, vectorMs: 0, keywordMs: 0, mergeMs: 0, rerankMs: 0, totalMs: 0 } } };
    let discoveryMetrics = { discoveryMs: 0, fetchMs: 0, candidateCount: 0 };

    if (sourceMode === 'web_discovery') {
      const { webDiscoveryService } = await import('@/features/rag/web-discovery/web-discovery.service');
      const discRes = await webDiscoveryService.discoverAndFetchCandidates(authUser.id, {
        query: retrievalQuery,
        targetWebsite,
        allowedSources
      });
      result.chunks = discRes.chunks;
      discoveryMetrics = {
        discoveryMs: discRes.metrics.discoveryMs ?? 0,
        fetchMs: discRes.metrics.fetchMs ?? 0,
        candidateCount: discRes.candidates.length
      };
    } else if (sourceMode === 'web_search') {
      const { webSearchService } = await import('@/features/rag/web-search/web-search.service');
      const searchRes = await webSearchService.executeWebSearch(authUser.id, retrievalQuery, {
        allowedSources,
        targetWebsite
      });
      result.chunks = searchRes.chunks;
      discoveryMetrics = {
        discoveryMs: searchRes.metrics.searchMs,
        fetchMs: searchRes.metrics.fetchMs,
        candidateCount: searchRes.metrics.resultsFound
      };
    } else {
      result = await retrievalService.retrieveContextWithTrace(authUser.id, retrievalQuery, {
        knowledgeBaseId: body.knowledgeBaseId,
        sourceMode
      });
    }

    const retrievedWebChunks = result.chunks.filter((c) => c.sourceType === 'WEB').length;
    const retrievedDocumentChunks = result.chunks.filter((c) => !c.sourceType || c.sourceType === 'DOCUMENT').length;

    return NextResponse.json({
      success: true,
      data: {
        originalQuestion,
        retrievalQuery,
        conversationContext: conversationContextDiagnostics,
        answerOrchestration: {
          classification,
          sourceMode,
          targetWebsite,
          allowedSources,
          cache: cached?.cacheType || 'miss',
          cacheHit: !!cached,
          cacheType: cached?.cacheType || 'none',
          answerMode: sourceMode === 'web_discovery' ? 'WEB_DISCOVERY_GROUNDED' : (sourceMode === 'web_search' ? 'WEB_SEARCH_GROUNDED' : (retrievedWebChunks > 0 && retrievedDocumentChunks > 0 ? 'MULTI_SOURCE_GROUNDED' : (retrievedWebChunks > 0 ? 'WEB_GROUNDED' : 'DOCUMENT_GROUNDED'))),
          semanticSimilarity: cached?.latencyTrace.semanticSimilarity ?? null,
          semanticThreshold: env.server?.RAG_SEMANTIC_CACHE_THRESHOLD ?? 0.90,
          candidateCount: discoveryMetrics.candidateCount || cached?.latencyTrace.semanticCandidateCount || 0,
          retrievedWebChunks,
          retrievedDocumentChunks,
          discoveryMs: discoveryMetrics.discoveryMs,
          fetchMs: discoveryMetrics.fetchMs,
          sourceEvidenceFingerprint: cached?.sourceEvidenceFingerprint ?? null,
          cacheLookupMs: cached?.latencyTrace.semanticCacheLookupMs ?? cacheLookupMs,
          embeddingMs: cached?.latencyTrace.embeddingGenerationMs ?? 0
        },
        trace: result.trace,
        latencyTrace: {
          memoryMs: conversationContextDiagnostics?.contextLoadMs ?? 0,
          discoveryMs: discoveryMetrics.discoveryMs,
          fetchMs: discoveryMetrics.fetchMs,
          embeddingMs: result.trace.metrics.embeddingMs,
          vectorMs: result.trace.metrics.vectorMs,
          keywordMs: result.trace.metrics.keywordMs,
          mergeMs: result.trace.metrics.mergeMs,
          rerankMs: result.trace.metrics.rerankMs,
          totalRetrievalMs: result.trace.metrics.totalMs
        },
        chunks: result.chunks
      }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }

    console.error('Unhandled POST /api/rag/debug error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'An error occurred during retrieval debugging.' } },
      { status: 500 }
    );
  }
}
