import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { collaborationService } from '@/features/collaboration/collaboration.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const channels = await collaborationService.getUserChannels(user.id);
    return NextResponse.json({ success: true, data: channels });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();

    const { type, name, description, targetUserId, memberUserIds } = body;

    if (type === 'DIRECT') {
      if (!targetUserId) {
        return NextResponse.json({ success: false, error: 'targetUserId is required for DIRECT channel' }, { status: 400 });
      }
      const channel = await collaborationService.getOrCreateDirectChannel(user.id, targetUserId);
      return NextResponse.json({ success: true, data: channel });
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'Group channel name is required' }, { status: 400 });
    }

    const channel = await collaborationService.createGroupChannel(user.id, name, description, memberUserIds || []);
    return NextResponse.json({ success: true, data: channel });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('Unauthorized') ? 401 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
