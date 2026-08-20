import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { collabCallService } from '@/features/collaboration/call.service';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    if (!body.channelId || !body.type) {
      return NextResponse.json({ success: false, error: 'channelId and type (VOICE/VIDEO) are required' }, { status: 400 });
    }

    const call = await collabCallService.initiateCall(user.id, {
      channelId: body.channelId,
      type: body.type
    });

    return NextResponse.json({ success: true, data: call }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to initiate call' },
      { status: err.message?.includes('Access Denied') ? 403 : 400 }
    );
  }
}
