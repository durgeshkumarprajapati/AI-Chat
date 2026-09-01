import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { assistantConversationService } from '@/features/assistant/conversation/assistant-conversation.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

/** GET /api/assistant/conversations/[id]/messages — paginated, ownership-checked. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get('limit')) || undefined;
    const offset = Number(searchParams.get('offset')) || undefined;

    const result = await assistantConversationService.getMessages(user.id, params.id, { limit, offset });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error.' } }, { status: 500 });
  }
}
