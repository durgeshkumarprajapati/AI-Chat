import { AgentRun, AgentPlanStep } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { auditService } from '@/features/audit/audit.service';
import { NotFoundError, ValidationError } from '@/errors';
import { plannerService } from './planner.service';
import { agentNotificationService } from './agent-notification.service';

export type AgentRunWithSteps = AgentRun & { steps: AgentPlanStep[] };

const TERMINAL_STATUSES = ['COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED'];

/**
 * Creates a new agent run: plans the goal (bounded planner, registry-validated steps), persists
 * the run and its steps, and picks the initial status.
 *
 * If every step in the validated plan is auto-executable (READ_ONLY and does not require
 * approval), the run starts directly in `EXECUTING` — there is nothing for a human to approve
 * yet, so there is no reason to sit in `AWAITING_APPROVAL`. The caller (the API route) is
 * responsible for actually invoking the execution engine right after this returns; this method
 * only decides and persists the correct starting state.
 */
export async function createRun(userId: string, goal: string, projectId?: string): Promise<AgentRunWithSteps> {
  const steps = await plannerService.planGoal(userId, goal, projectId);

  const anyRequiresApproval = steps.some((s) => s.requiresApproval);
  const initialStatus = anyRequiresApproval ? 'AWAITING_APPROVAL' : 'EXECUTING';

  const run = await prisma.agentRun.create({
    data: {
      userId,
      projectId: projectId || null,
      goal,
      status: initialStatus,
      planJson: steps as any,
      steps: {
        create: steps.map((step, index) => ({
          stepIndex: index,
          toolId: step.toolId,
          description: step.description,
          inputJson: step.input as any,
          riskLevel: step.riskLevel,
          requiresApproval: step.requiresApproval,
          status: 'PENDING',
          approvalDecision: 'PENDING'
        }))
      }
    },
    include: { steps: { orderBy: { stepIndex: 'asc' } } }
  });

  await auditService.logEvent({
    actorId: userId,
    action: 'AGENT_RUN_CREATED',
    targetType: 'AGENT_RUN',
    targetId: run.id,
    projectId: projectId || null,
    details: { goal, stepCount: steps.length, status: initialStatus }
  });

  agentNotificationService.notifyPlanCreated(run).catch(() => {});

  return run;
}

/** Verifies ownership without leaking existence: a run that exists but belongs to another user
 * returns the same NotFoundError as a run that does not exist at all. */
export async function getRun(userId: string, runId: string): Promise<AgentRunWithSteps> {
  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
    include: { steps: { orderBy: { stepIndex: 'asc' } } }
  });
  if (!run || run.userId !== userId) {
    throw new NotFoundError('Agent run');
  }
  return run;
}

export async function listRuns(
  userId: string,
  filters?: { status?: AgentRun['status']; projectId?: string }
): Promise<AgentRunWithSteps[]> {
  return prisma.agentRun.findMany({
    where: {
      userId,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.projectId ? { projectId: filters.projectId } : {})
    },
    orderBy: { createdAt: 'desc' },
    include: { steps: { orderBy: { stepIndex: 'asc' } } }
  });
}

export async function cancelRun(userId: string, runId: string): Promise<AgentRunWithSteps> {
  const run = await getRun(userId, runId);
  if (TERMINAL_STATUSES.includes(run.status)) {
    throw new ValidationError(`Agent run is already in a terminal state (${run.status}) and cannot be cancelled.`);
  }

  await prisma.agentPlanStep.updateMany({
    where: { agentRunId: run.id, status: 'PENDING' },
    data: { status: 'SKIPPED' }
  });

  const updated = await prisma.agentRun.update({
    where: { id: run.id },
    data: { status: 'CANCELLED' },
    include: { steps: { orderBy: { stepIndex: 'asc' } } }
  });

  await auditService.logEvent({
    actorId: userId,
    action: 'AGENT_RUN_CANCELLED',
    targetType: 'AGENT_RUN',
    targetId: run.id,
    projectId: run.projectId,
    details: {}
  });

  return updated;
}

export const agentRunService = { createRun, getRun, listRuns, cancelRun };
