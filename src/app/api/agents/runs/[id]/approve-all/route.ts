import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { approvalService } from '@/features/ai-agent/approval.service';
import { executionEngineService } from '@/features/ai-agent/execution-engine.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agents/runs/[id]/approve-all — approves all pending steps for a run,
 * then resumes the execution engine synchronously.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    await approvalService.approveAllSteps(user.id, params.id);
    const run = await executionEngineService.executeRun(user.id, params.id);

    return NextResponse.json({ success: true, data: run });
  } catch (err: any) {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 400;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
