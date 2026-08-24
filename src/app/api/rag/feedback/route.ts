import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { evaluationService } from '@/features/rag/evaluation/evaluation.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const body = await req.json();

    if (!body || !body.messageId || !body.conversationId || !body.rating) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'messageId, conversationId, and rating are required' } },
        { status: 400 }
      );
    }

    if (body.rating !== 'POSITIVE' && body.rating !== 'NEGATIVE') {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'rating must be POSITIVE or NEGATIVE' } },
        { status: 400 }
      );
    }

    await evaluationService.submitFeedback({
      userId: authUser.id,
      conversationId: body.conversationId,
      messageId: body.messageId,
      rating: body.rating,
      reason: body.reason || undefined,
      comment: body.comment || undefined
    });

    return NextResponse.json({ success: true, message: 'Feedback submitted successfully' });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to submit feedback' } },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const list = await evaluationService.getUserFeedbackList(authUser.id);
    return NextResponse.json({ success: true, data: list });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list feedback' } },
      { status: 500 }
    );
  }
}
