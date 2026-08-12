import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { chatService } from '@/features/rag/chat/chat.service';
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

    const response = await chatService.sendMessage(authUser.id, {
      conversationId: body.conversationId,
      question: body.question
    });

    return NextResponse.json({
      success: true,
      data: response
    });
  } catch (error) {
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
