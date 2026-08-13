import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { retrievalService } from '@/features/rag/retrieval/retrieval.service';
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

    const result = await retrievalService.retrieveContextWithTrace(authUser.id, body.question, {
      knowledgeBaseId: body.knowledgeBaseId
    });

    return NextResponse.json({
      success: true,
      data: {
        trace: result.trace,
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
