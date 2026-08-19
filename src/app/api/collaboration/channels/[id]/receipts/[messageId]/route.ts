import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { collaborationService } from '@/features/collaboration/collaboration.service';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; messageId: string } }
) {
  try {
    const user = await getAuthUser(req);
    const summary = await collaborationService.getMessageReceiptSummary(params.id, user.id, params.messageId);
    return NextResponse.json({ success: true, data: summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = msg.includes('Unauthorized') || msg.includes('Access Denied') ? 401 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
