import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { approvalService } from '@/features/ai-agent/approval.service';
import { executionEngineService } from '@/features/ai-agent/execution-engine.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agents/runs/[id]/approve — body { stepIndex, note? }.
 * Approves the step, then resumes the execution engine (it will run whatever steps that
 * approval unblocked, and stop again at the next step still awaiting a decision, if any).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = await req.json();
    const stepIndex = body?.stepIndex;
    const note = typeof body?.note === 'string' ? body.note : undefined;

    if (typeof stepIndex !== 'number' && typeof stepIndex !== 'string') {
      return NextResponse.json({ success: false, error: 'A "stepIndex" is required.' }, { status: 400 });
    }

    await approvalService.approveStep(user.id, params.id, stepIndex, note);
    const run = await executionEngineService.executeRun(user.id, params.id);

    return NextResponse.json({ success: true, data: run });
  } catch (err: any) {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 400;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
