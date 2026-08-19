import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { collaborationService } from '@/features/collaboration/collaboration.service';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(req);
    const channel = await collaborationService.getChannelDetails(params.id, user.id);
    return NextResponse.json({ success: true, data: channel });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('Denied') || msg.includes('Unauthorized') ? 403 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
