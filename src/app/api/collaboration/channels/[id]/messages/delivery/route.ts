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
    const { messageIds } = body;

    if (!Array.isArray(messageIds)) {
      return NextResponse.json({ success: false, error: 'messageIds must be an array of string IDs' }, { status: 400 });
    }

    const result = await collaborationService.acknowledgeDelivery(params.id, user.id, messageIds);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('Unauthorized') || msg.includes('Access Denied') ? 401 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
