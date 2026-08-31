import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { agentRunService } from '@/features/ai-agent/agent-run.service';
import { executionEngineService } from '@/features/ai-agent/execution-engine.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agents/runs — plans and creates a new agent run.
 *
 * If the resulting plan required no human approval (i.e. every step is READ_ONLY and
 * auto-executable), the run starts in EXECUTING rather than AWAITING_APPROVAL, so we run the
 * execution engine synchronously here before responding — there is nothing for a human to do,
 * so there is no reason to make the caller poll or make a second request. A plan with at least
 * one MEDIUM/HIGH/CRITICAL step instead starts (and stays) in AWAITING_APPROVAL until the
 * approve/reject routes are used.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const body = await req.json();
    const goal = typeof body?.goal === 'string' ? body.goal : '';
    const projectId = typeof body?.projectId === 'string' ? body.projectId : undefined;

    let run = await agentRunService.createRun(user.id, goal, projectId);

    if (run.status !== 'AWAITING_APPROVAL') {
      run = await executionEngineService.executeRun(user.id, run.id);
    }

    return NextResponse.json({ success: true, data: run });
  } catch (err: any) {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 400;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

/** GET /api/agents/runs — lists the current user's own agent runs. */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || undefined;
    const projectId = searchParams.get('projectId') || undefined;

    const runs = await agentRunService.listRuns(user.id, {
      status: status as any,
      projectId
    });

    return NextResponse.json({ success: true, data: runs });
  } catch (err: any) {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 400;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
