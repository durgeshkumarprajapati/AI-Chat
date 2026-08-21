import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { chillFocusStreakService } from '@/features/chill-focus/chill-focus.streak.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const streak = await chillFocusStreakService.getStreakSummary(user.id);
    return NextResponse.json({ success: true, data: streak });
  } catch (err: any) {
    const msg = err?.message || String(err);
    const status = msg.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
