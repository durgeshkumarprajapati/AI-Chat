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
    const { userId: newOwnerId } = body;

    if (!newOwnerId) {
      return NextResponse.json({ success: false, error: 'Target userId is required' }, { status: 400 });
    }

    const result = await collaborationService.transferOwnership(params.id, user.id, newOwnerId);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('Unauthorized') || msg.includes('Access Denied') ? 401 : msg.includes('Forbidden') ? 403 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
