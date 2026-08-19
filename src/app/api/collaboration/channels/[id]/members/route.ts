import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { collaborationService } from '@/features/collaboration/collaboration.service';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();

    const { userId, userIds, role } = body;
    const targets = userIds || (userId ? [userId] : []);

    if (!targets || targets.length === 0) {
      return NextResponse.json({ success: false, error: 'userId or userIds array is required' }, { status: 400 });
    }

    const members = await collaborationService.addMembers(params.id, user.id, targets, role);
    return NextResponse.json({ success: true, data: Array.isArray(userIds) ? members : members[0] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('Forbidden') || msg.includes('Unauthorized') ? 403 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(req);
    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get('userId') || user.id;

    const result = await collaborationService.removeMember(params.id, user.id, targetUserId);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('Forbidden') || msg.includes('Unauthorized') ? 403 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
