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
    if (!body.action) {
      return NextResponse.json({ success: false, error: 'action is required (accept/decline/mute/unmute/video_off/video_on/end)' }, { status: 400 });
    }

    const result = await collabCallService.handleCallAction(params.id, user.id, body.action);
    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to process call action' },
      { status: 400 }
    );
  }
}
