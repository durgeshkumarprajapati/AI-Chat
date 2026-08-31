import { AgentPlanStep } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { auditService } from '@/features/audit/audit.service';
import { NotFoundError, ValidationError } from '@/errors';
import { agentRunService } from './agent-run.service';

/**
 * Phase 78C — the Human-in-the-Loop Approval Engine.
 *
 * Authorization rule (deliberately simple): an agent run is a personal agent acting on behalf of
 * one user, not a shared team workflow, so ONLY the run's own creator may approve or reject its
 * steps. This is `agentRunService.getRun`'s existing ownership check (`run.userId === approverId`,
 * 404 either way so existence is never leaked) — reused here rather than re-implemented, so there
 * is exactly one place that decides "does this user own this run."
 *
 * MEDIUM/HIGH/CRITICAL steps can only ever reach EXECUTING/SUCCEEDED once `approvalDecision`
 * is APPROVED. That is enforced here (a step can only move to APPROVED via this explicit call)
 * AND independently re-checked in `execution-engine.service.ts` before it ever calls a tool's
 * `execute()` — defense in depth, not a single call site.
 */

function resolveStep(steps: AgentPlanStep[], stepIndexOrStepId: number | string): AgentPlanStep {
  const step =
    typeof stepIndexOrStepId === 'number'
      ? steps.find((s) => s.stepIndex === stepIndexOrStepId)
      : steps.find((s) => s.id === stepIndexOrStepId || s.stepIndex === Number(stepIndexOrStepId));
  if (!step) {
    throw new NotFoundError('Agent plan step');
  }
  return step;
}

export async function approveStep(
  approverId: string,
  runId: string,
  stepIndexOrStepId: number | string,
  note?: string
): Promise<AgentPlanStep> {
  const run = await agentRunService.getRun(approverId, runId);
  const step = resolveStep(run.steps, stepIndexOrStepId);

  if (step.status !== 'PENDING') {
    throw new ValidationError(`Step ${step.stepIndex} is not awaiting a decision (status: ${step.status}).`);
  }

  const updated = await prisma.agentPlanStep.update({
    where: { id: step.id },
    data: {
      approvalDecision: 'APPROVED',
      approverId,
      approvalDecidedAt: new Date(),
      approvalNote: note || null,
      status: 'APPROVED'
    }
  });

  await auditService.logEvent({
    actorId: approverId,
    action: 'AGENT_STEP_APPROVED',
    targetType: 'AGENT_PLAN_STEP',
    targetId: step.id,
    projectId: run.projectId,
    details: { runId: run.id, stepIndex: step.stepIndex, toolId: step.toolId, note }
  });

  return updated;
}

export async function rejectStep(
  approverId: string,
  runId: string,
  stepIndexOrStepId: number | string,
  note?: string
): Promise<AgentPlanStep> {
  const run = await agentRunService.getRun(approverId, runId);
  const step = resolveStep(run.steps, stepIndexOrStepId);

  if (step.status !== 'PENDING') {
    throw new ValidationError(`Step ${step.stepIndex} is not awaiting a decision (status: ${step.status}).`);
  }

  const updated = await prisma.agentPlanStep.update({
    where: { id: step.id },
    data: {
      approvalDecision: 'REJECTED',
      approverId,
      approvalDecidedAt: new Date(),
      approvalNote: note || null,
      status: 'REJECTED'
    }
  });

  await auditService.logEvent({
    actorId: approverId,
    action: 'AGENT_STEP_REJECTED',
    targetType: 'AGENT_PLAN_STEP',
    targetId: step.id,
    projectId: run.projectId,
    details: { runId: run.id, stepIndex: step.stepIndex, toolId: step.toolId, note }
  });

  // A rejected required step blocks the rest of the plan — the whole run is rejected, and any
  // step still awaiting a decision is skipped rather than left dangling.
  if (step.requiresApproval) {
    await prisma.agentPlanStep.updateMany({
      where: { agentRunId: run.id, status: 'PENDING' },
      data: { status: 'SKIPPED' }
    });
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: 'REJECTED', resultSummary: `Run rejected: step ${step.stepIndex} (${step.toolId}) was rejected.` }
    });

    await auditService.logEvent({
      actorId: approverId,
      action: 'AGENT_RUN_REJECTED',
      targetType: 'AGENT_RUN',
      targetId: run.id,
      projectId: run.projectId,
      details: { rejectedStepIndex: step.stepIndex }
    });
  }

  return updated;
}

export async function editStepInput(
  userId: string,
  runId: string,
  stepIndexOrStepId: number | string,
  newInput: Record<string, unknown>,
  newDescription?: string
): Promise<AgentPlanStep> {
  const run = await agentRunService.getRun(userId, runId);
  const step = resolveStep(run.steps, stepIndexOrStepId);

  if (step.status !== 'PENDING') {
    throw new ValidationError(`Step ${step.stepIndex} is not in PENDING status (status: ${step.status}) and cannot be edited.`);
  }

  const updated = await prisma.agentPlanStep.update({
    where: { id: step.id },
    data: {
      inputJson: newInput as any,
      ...(newDescription && newDescription.trim() ? { description: newDescription.trim() } : {})
    }
  });

  await auditService.logEvent({
    actorId: userId,
    action: 'AGENT_STEP_EDITED',
    targetType: 'AGENT_PLAN_STEP',
    targetId: step.id,
    projectId: run.projectId,
    details: { runId: run.id, stepIndex: step.stepIndex, toolId: step.toolId }
  });

  return updated;
}

export async function approveAllSteps(
  approverId: string,
  runId: string
): Promise<AgentPlanStep[]> {
  const run = await agentRunService.getRun(approverId, runId);
  const pendingSteps = run.steps.filter((s) => s.status === 'PENDING');

  if (pendingSteps.length === 0) {
    return run.steps;
  }

  await prisma.agentPlanStep.updateMany({
    where: {
      agentRunId: run.id,
      status: 'PENDING'
    },
    data: {
      approvalDecision: 'APPROVED',
      approverId,
      approvalDecidedAt: new Date(),
      status: 'APPROVED'
    }
  });

  await auditService.logEvent({
    actorId: approverId,
    action: 'AGENT_ALL_STEPS_APPROVED',
    targetType: 'AGENT_RUN',
    targetId: run.id,
    projectId: run.projectId,
    details: { approvedStepCount: pendingSteps.length }
  });

  const refreshedRun = await agentRunService.getRun(approverId, runId);
  return refreshedRun.steps;
}

export const approvalService = { approveStep, rejectStep, editStepInput, approveAllSteps };
