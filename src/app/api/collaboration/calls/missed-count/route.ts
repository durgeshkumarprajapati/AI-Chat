import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { callHistoryService } from '@/features/collaboration/call-history/call-history.service';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const res = await callHistoryService.getMissedCallCount(user.id);
    return NextResponse.json({ success: true, ...res }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch missed call count' },
      { status: 400 }
    );
  }
}
