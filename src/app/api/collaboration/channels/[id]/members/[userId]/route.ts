import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { collaborationService } from '@/features/collaboration/collaboration.service';

export const dynamic = 'force-dynamic';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  try {
    const user = await getAuthUser(req);
    const result = await collaborationService.removeMember(params.id, user.id, params.userId);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('Unauthorized') || msg.includes('Access Denied') ? 401 : msg.includes('Forbidden') ? 403 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
