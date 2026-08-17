import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { studySessionService } from '@/features/study';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const weakAreas = await studySessionService.getWeakAreas(user.id);
    return NextResponse.json({ success: true, data: weakAreas });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
