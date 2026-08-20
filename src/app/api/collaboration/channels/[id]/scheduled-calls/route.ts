import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { scheduledCallService } from '@/features/collaboration/scheduled-calls/scheduled-call.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(req);
    const { id } = await context.params;

    const calls = await scheduledCallService.getChannelScheduledCalls(user.id, id);
    return NextResponse.json({ success: true, data: calls });
  } catch (err: any) {
    const msg = err?.message || String(err);
    const status = msg.includes('Unauthorized') ? 401 : msg.includes('denied') ? 403 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
