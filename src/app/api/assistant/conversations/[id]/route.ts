import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { assistantConversationService } from '@/features/assistant/conversation/assistant-conversation.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

/** GET /api/assistant/conversations/[id] — detail, ownership-checked (404 for both "doesn't
 * exist" and "exists but belongs to someone else" — never leaks existence). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const conversation = await assistantConversationService.getConversationDetail(user.id, params.id);
    return NextResponse.json({ success: true, data: conversation });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error.' } }, { status: 500 });
  }
}

/** DELETE /api/assistant/conversations/[id] — soft-delete (isDeleted: true), audit-logged. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    await assistantConversationService.deleteConversation(user.id, params.id);
    return NextResponse.json({ success: true, data: { id: params.id, isDeleted: true } });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error.' } }, { status: 500 });
  }
}
