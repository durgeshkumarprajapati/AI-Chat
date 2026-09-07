import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { chatService } from '@/features/rag/chat/chat.service';
import { AppError } from '@/errors';
import { ragPerformanceTelemetryService } from '@/features/rag/performance/rag-telemetry.service';
import { ragExecutionContextManager } from '@/features/rag/performance/rag-execution-context';

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

    const response = await chatService.sendMessage(authUser.id, {
      conversationId: body.conversationId,
      question: body.question,
      knowledgeBaseId: body.knowledgeBaseId,
      sourceMode: body.sourceMode,
      targetWebsite: body.targetWebsite,
      allowedSources: body.allowedSources,
      allowGeneralKnowledge: body.allowGeneralKnowledge,
      requestedAnswerMode: body.requestedAnswerMode,
      searchAllKbs: body.searchAllKbs
    } as any);

    return NextResponse.json({
      success: true,
      data: response
    });
  } catch (error) {
    // Observability only (added this pass): the request failed before or without ever reaching a
    // stage that already shares a requestId (chat.service.ts has no top-level try/catch of its
    // own — see this pass's report for why one wasn't added there), so this gets its own id, useful
    // for referencing this one failure in logs even without cross-stage correlation. Never blocks
    // or alters the actual error response below.
    const errorCode = error instanceof AppError ? error.code : 'INTERNAL_SERVER_ERROR';
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    try {
      ragPerformanceTelemetryService.logEvent({
        event: 'rag.request.failed',
        requestId: ragExecutionContextManager.create().requestId,
        metadata: { route: 'POST /api/chat', errorCode, statusCode }
      });
    } catch (telemetryErr) {
      console.warn('[api/chat] Telemetry logging failed (response unaffected):', telemetryErr);
    }

    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }

    console.error('Unhandled POST /api/chat error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'An error occurred processing the chat query.' } },
      { status: 500 }
    );
  }
}
