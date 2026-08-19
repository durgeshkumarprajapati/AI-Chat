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

    const { userId, role } = body;
    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId is required' }, { status: 400 });
    }

    const member = await collaborationService.addMember(params.id, user.id, userId, role);
    return NextResponse.json({ success: true, data: member });
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
