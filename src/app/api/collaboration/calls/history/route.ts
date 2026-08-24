import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { callHistoryService } from '@/features/collaboration/call-history/call-history.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const type = (searchParams.get('type') as any) || undefined;
    const status = (searchParams.get('status') as any) || undefined;
    const channelId = searchParams.get('channelId') || undefined;
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;

    const result = await callHistoryService.getCallHistory(user.id, {
      page,
      limit,
      type,
      status,
      channelId,
      from,
      to
    });

    return NextResponse.json({ success: true, ...result }, { status: 200 });
  } catch (err: any) {
    const isAccessDenied = err.message?.includes('Access Denied');
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch call history' },
      { status: isAccessDenied ? 403 : 400 }
    );
  }
}
