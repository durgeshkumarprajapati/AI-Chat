import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { chillFocusService } from '@/features/chill-focus/chill-focus.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const { searchParams } = new URL(req.url);
    const studyMinutes = parseInt(searchParams.get('studyMinutes') || '52', 10);

    const intervention = await chillFocusService.getAIIntervention(user.id, studyMinutes);
    return NextResponse.json({ success: true, data: intervention });
  } catch (err: any) {
    const msg = err?.message || String(err);
    const status = msg.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
