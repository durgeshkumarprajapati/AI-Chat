import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { collaborationService } from '@/features/collaboration/collaboration.service';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(req);
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const messages = await collaborationService.getMessages(params.id, user.id, limit);
    return NextResponse.json({ success: true, data: messages });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('Denied') || msg.includes('Unauthorized') ? 403 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();

    const {
      content,
      replyToId,
      sharedRoadmapId,
      sharedRoadmapStepId,
      sharedEntityId,
      sharedDocumentId,
      sharedStudyQuestionId,
      metadata
    } = body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Message content cannot be empty' }, { status: 400 });
    }

    const message = await collaborationService.sendMessage(params.id, user.id, {
      content: content.trim(),
      replyToId,
      sharedRoadmapId,
      sharedRoadmapStepId,
      sharedEntityId,
      sharedDocumentId,
      sharedStudyQuestionId,
      metadata
    });

    return NextResponse.json({ success: true, data: message });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('Denied') || msg.includes('Unauthorized') ? 403 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(req);
    const result = await collaborationService.markChannelRead(params.id, user.id);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 400 });
  }
}
