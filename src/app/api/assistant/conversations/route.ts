import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { assistantConversationService } from '@/features/assistant/conversation/assistant-conversation.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

/** GET /api/assistant/conversations — lists the current user's own non-deleted conversations. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get('limit')) || undefined;
    const offset = Number(searchParams.get('offset')) || undefined;

    const result = await assistantConversationService.listConversations(user.id, { limit, offset });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error.' } }, { status: 500 });
  }
}

/** POST /api/assistant/conversations — creates an empty conversation (e.g. an explicit "New conversation" button). */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = await req.json().catch(() => ({}));
    const scope = typeof body?.scope === 'string' ? body.scope : undefined;
    const projectId = typeof body?.projectId === 'string' ? body.projectId : undefined;

    const conversation = await assistantConversationService.createEmptyConversation(user.id, scope, projectId);
    return NextResponse.json({ success: true, data: conversation }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error.' } }, { status: 500 });
  }
}
