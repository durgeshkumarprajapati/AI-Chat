import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { chillFocusSessionService } from '@/features/chill-focus/chill-focus.session.service';
import { createSessionSchema } from '@/features/chill-focus/chill-focus.schemas';
import { chillFocusRepository } from '@/features/chill-focus/chill-focus.repository';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));
    const parsed = createSessionSchema.parse(body);

    const session = await chillFocusSessionService.createSession(user.id, {
      mode: parsed.mode as any,
      plannedDurationSeconds: parsed.plannedDurationSeconds,
      soundscape: parsed.soundscape
    });

    return NextResponse.json({ success: true, data: session }, { status: 201 });
  } catch (err: any) {
    const msg = err?.message || String(err);
    const status = msg.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const activeSession = await chillFocusRepository.findActiveSession(user.id);
    if (!activeSession) {
      return NextResponse.json({ success: true, data: null });
    }

    const session = await chillFocusSessionService.getSession(activeSession.id, user.id);
    return NextResponse.json({ success: true, data: session });
  } catch (err: any) {
    const msg = err?.message || String(err);
    const status = msg.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
