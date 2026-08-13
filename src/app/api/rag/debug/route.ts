import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { retrievalService } from '@/features/rag/retrieval/retrieval.service';
import { conversationContextService } from '@/features/rag/chat/conversation-context.service';
import { AppError } from '@/errors';

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

    const result = await retrievalService.retrieveContextWithTrace(authUser.id, retrievalQuery, {
      knowledgeBaseId: body.knowledgeBaseId
    });

    return NextResponse.json({
      success: true,
      data: {
        originalQuestion,
        retrievalQuery,
        conversationContext: conversationContextDiagnostics,
        trace: result.trace,
        latencyTrace: {
          memoryMs: conversationContextDiagnostics?.contextLoadMs ?? 0,
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
