import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { callHistoryService } from '@/features/collaboration/call-history/call-history.service';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { id: callId } = await params;
    const callDetails = await callHistoryService.getCallDetails(callId, user.id);

    if (!callDetails) {
      return NextResponse.json({ success: false, error: 'Call not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, call: callDetails }, { status: 200 });
  } catch (err: any) {
    const isAccessDenied = err.message?.includes('Access Denied');
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch call details' },
      { status: isAccessDenied ? 403 : 400 }
    );
  }
}
