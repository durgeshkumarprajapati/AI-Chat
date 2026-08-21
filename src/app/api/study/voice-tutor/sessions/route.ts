import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { voiceTutorSessionService } from '@/features/voice-tutor/voice-tutor.session.service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));

    const session = await voiceTutorSessionService.createSession(user.id, {
      title: body.title,
      mode: body.mode,
      knowledgeBaseId: body.knowledgeBaseId,
      documentId: body.documentId
    });

    return NextResponse.json({ success: true, data: session }, { status: 201 });
  } catch (err: any) {
    const msg = err?.message || String(err);
    const status = msg.includes('Unauthorized') ? 401 : msg.includes('Forbidden') ? 403 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const result = await voiceTutorSessionService.listUserSessions(user.id, { limit, offset });
    return NextResponse.json({ success: true, data: result.sessions, total: result.total });
  } catch (err: any) {
    const msg = err?.message || String(err);
    const status = msg.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
