import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { agentRunService } from '@/features/ai-agent/agent-run.service';

export const dynamic = 'force-dynamic';

/** GET /api/agents/runs/[id] — single run + its steps, ownership-checked (404 for both
 * "doesn't exist" and "exists but belongs to someone else" — never leaks existence). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const run = await agentRunService.getRun(user.id, params.id);
    return NextResponse.json({ success: true, data: run });
  } catch (err: any) {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 404;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

/** DELETE /api/agents/runs/[id] — cancels a run that isn't already terminal. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await requireAuthenticatedUser(req);
    const run = await agentRunService.cancelRun(user.id, params.id);
    return NextResponse.json({ success: true, data: run });
  } catch (err: any) {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 400;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
