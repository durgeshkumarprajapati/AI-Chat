import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { chatService } from '@/features/rag/chat/chat.service';
import { AppError } from '@/errors';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const conversations = await chatService.getUserConversations(authUser.id);
    return NextResponse.json({ success: true, data: conversations });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve conversations' } },
      { status: 500 }
    );
  }
}
