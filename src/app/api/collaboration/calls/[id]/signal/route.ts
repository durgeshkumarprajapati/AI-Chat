import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { collabCallService } from '@/features/collaboration/call.service';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    if (!body.signalType || !body.signalData) {
      return NextResponse.json({ success: false, error: 'signalType and signalData are required' }, { status: 400 });
    }

    const result = await collabCallService.relaySignal(params.id, user.id, {
      targetUserId: body.targetUserId,
      signalType: body.signalType,
      signalData: body.signalData
    });

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to relay WebRTC signal' },
      { status: 400 }
    );
  }
}
