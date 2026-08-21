import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { chillFocusSessionService } from '@/features/chill-focus/chill-focus.session.service';
import { chillFocusStreakService } from '@/features/chill-focus/chill-focus.streak.service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(req);
    const { id } = await context.params;

    const session = await chillFocusSessionService.completeSession(id, user.id);
    const streak = await chillFocusStreakService.getStreakSummary(user.id);

    return NextResponse.json({
      success: true,
      data: {
        session,
        streak
      }
    });
  } catch (err: any) {
    const msg = err?.message || String(err);
    const status = msg.includes('Unauthorized') ? 401 : msg.includes('not found') ? 404 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
