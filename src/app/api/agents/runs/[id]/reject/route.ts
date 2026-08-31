import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { approvalService } from '@/features/ai-agent/approval.service';

export const dynamic = 'force-dynamic';

/** POST /api/agents/runs/[id]/reject — body { stepIndex, note? }. Rejecting a required step
 * cascades to REJECT the whole run (see approval.service.ts), so there is nothing further to
 * resume here. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = await req.json();
    const stepIndex = body?.stepIndex;
    const note = typeof body?.note === 'string' ? body.note : undefined;

    if (typeof stepIndex !== 'number' && typeof stepIndex !== 'string') {
      return NextResponse.json({ success: false, error: 'A "stepIndex" is required.' }, { status: 400 });
    }

    const step = await approvalService.rejectStep(user.id, params.id, stepIndex, note);
    return NextResponse.json({ success: true, data: step });
  } catch (err: any) {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 400;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
