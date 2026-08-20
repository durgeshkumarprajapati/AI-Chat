import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { scheduledCallService } from '@/features/collaboration/scheduled-calls/scheduled-call.service';
import { RescheduleCallSchema } from '@/features/collaboration/scheduled-calls/scheduled-call.types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(req);
    const { id } = await context.params;

    const call = await scheduledCallService.getScheduledCallDetails(user.id, id);
    return NextResponse.json({ success: true, data: call });
  } catch (err: any) {
    const msg = err?.message || String(err);
    const status = msg.includes('Unauthorized') ? 401 : msg.includes('denied') ? 403 : msg.includes('not found') ? 404 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(req);
    const { id } = await context.params;
    const body = await req.json();

    const parsed = RescheduleCallSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: parsed.error.format() },
        { status: 400 }
      );
    }

    const updatedCall = await scheduledCallService.rescheduleCall(user.id, id, parsed.data);
    return NextResponse.json({ success: true, data: updatedCall });
  } catch (err: any) {
    const msg = err?.message || String(err);
    const status = msg.includes('Unauthorized') ? 401 : msg.includes('organizer') ? 403 : msg.includes('not found') ? 404 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(req);
    const { id } = await context.params;

    const cancelledCall = await scheduledCallService.cancelCall(user.id, id);
    return NextResponse.json({ success: true, data: cancelledCall });
  } catch (err: any) {
    const msg = err?.message || String(err);
    const status = msg.includes('Unauthorized') ? 401 : msg.includes('organizer') ? 403 : msg.includes('not found') ? 404 : 400;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
