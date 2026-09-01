import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { approvalService } from '@/features/ai-agent/approval.service';
import { executionEngineService } from '@/features/ai-agent/execution-engine.service';
import { prisma } from '@/lib/prisma';
import { automationEngineService } from '@/features/automation/engine/automation-engine.service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/agents/runs/[id]/approve — body { stepIndex, note? }.
 * Approves the step, then resumes the execution engine (it will run whatever steps that
 * approval unblocked, and stop again at the next step still awaiting a decision, if any).
 *
 * Phase 88 addition (the ONLY touch to any `agents/runs` route file): after the pre-existing
 * approve+execute flow above completes, this AgentRun may actually belong to an Automation's
 * graph walk (an AI_AGENT/APPROVAL/CLICKUP_ACTION/CALENDAR_ACTION node creates its underlying
 * AgentRun via the exact same agentRunService/executionEngineService used here — see
 * automation-engine.service.ts's runAgentBackedNode()). If a WAITING_APPROVAL
 * AutomationExecution references this run, its graph walk is resumed from exactly where it
 * stopped — the underlying AgentRun is now past its approval gate, so the automation step
 * handler re-checks the run's (now-terminal) status and continues walking. This is deliberately
 * a thin, best-effort resume: a failure here never re-throws (an approval must always succeed
 * for the Phase 87 run itself even if the automation-layer resume has a transient problem — the
 * next scheduler tick / manual retry can still pick the execution back up since its state lives
 * entirely in Postgres, not in this request).
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

    try {
      const waitingExecution = await prisma.automationExecution.findFirst({
        where: { agentRunId: run.id, status: 'WAITING_APPROVAL' }
      });
      if (waitingExecution) {
        await automationEngineService.runExecution(waitingExecution.id);
      }
    } catch (resumeErr) {
      console.warn(`[AgentApproveRoute] Automation resume failed for agent run ${run.id} (non-fatal):`, resumeErr);
    }

    return NextResponse.json({ success: true, data: run });
  } catch (err: any) {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 400;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
