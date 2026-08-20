import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { callHistoryService } from '@/features/collaboration/call-history/call-history.service';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id: channelId } = await params;
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const result = await callHistoryService.getChannelCallHistory(user.id, channelId, page, limit);
    return NextResponse.json({ success: true, ...result }, { status: 200 });
  } catch (err: any) {
    const isAccessDenied = err.message?.includes('Access Denied');
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch channel call history' },
      { status: isAccessDenied ? 403 : 400 }
    );
  }
}
