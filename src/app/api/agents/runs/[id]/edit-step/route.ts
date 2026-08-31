import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { approvalService } from '@/features/ai-agent/approval.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agents/runs/[id]/edit-step — body { stepIndex, input, description? }.
 * Allows modifying a proposed step's input parameters before human approval.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = await req.json();
    const stepIndex = body?.stepIndex;
    const input = body?.input;
    const description = typeof body?.description === 'string' ? body.description : undefined;

    if (typeof stepIndex !== 'number' && typeof stepIndex !== 'string') {
      return NextResponse.json({ success: false, error: 'A "stepIndex" is required.' }, { status: 400 });
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return NextResponse.json({ success: false, error: 'A valid "input" object is required.' }, { status: 400 });
    }

    const updatedStep = await approvalService.editStepInput(user.id, params.id, stepIndex, input, description);

    return NextResponse.json({ success: true, data: updatedStep });
  } catch (err: any) {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 400;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
