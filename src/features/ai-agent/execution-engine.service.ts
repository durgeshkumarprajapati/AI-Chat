import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { auditService } from '@/features/audit/audit.service';
import { SecurityError } from '@/errors';
import { agentRunService, AgentRunWithSteps } from './agent-run.service';
import { getRegisteredTool } from './tool-registry';
import { AgentToolContext } from './ai-agent.types';

/**
 * Phase 78C — the execution engine.
 *
 * Runs a plan's PENDING/APPROVED steps in `stepIndex` order. Two independent gates protect every
 * MEDIUM/HIGH/CRITICAL-risk step from auto-executing:
 *   1. This engine's own gate below (`autoExecutable` / `approvalDecision === 'APPROVED'`).
 *   2. `approval.service.ts`'s own state machine (a step can only ever reach `APPROVED` through
 *      an explicit, ownership-checked `approveStep` call).
 * Neither alone is trusted — this is defense in depth, not a single call site.
 *
 * Conservative design choices (documented per the task brief, since dependency-graph analysis
 * between steps is out of scope for this slice):
 *   - On ANY step's genuine failure, the whole run stops and is marked FAILED; later steps are
 *     marked SKIPPED rather than guessed to be independently safe to run.
 *   - The overall run timeout (`AGENT_MAX_EXECUTION_TIME_MS`) is measured from the run's
 *     `createdAt`, so a run resumed across multiple approval round-trips still has one bounded
 *     total execution budget rather than a fresh budget per resume.
 */

const TERMINAL_RUN_STATUSES = ['COMPLETED', 'FAILED', 'REJECTED', 'CANCELLED'];
const TERMINAL_STEP_STATUSES = ['SUCCEEDED', 'FAILED', 'SKIPPED', 'REJECTED'];

function computeIdempotencyKey(stepId: string, toolId: string): string {
  return crypto.createHash('sha256').update(`${stepId}:${toolId}`).digest('hex');
}

/** First layer: reuse the audit service's own key-based redaction (tokens/secrets/passwords/
 * authorization headers by field name). Second layer: a regex sweep for bearer-token-shaped
 * string VALUES regardless of the key they're stored under, since a tool should never emit a raw
 * token in the first place — this is only a defensive backstop. */
function scrubForPersistence(data: unknown): unknown {
  const sanitized = auditService.sanitizeMetadata(data);
  return redactTokenShapedStrings(sanitized);
}

function redactTokenShapedStrings(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, '[REDACTED_TOKEN]');
  }
  if (Array.isArray(value)) {
    return value.map(redactTokenShapedStrings);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactTokenShapedStrings(v);
    }
    return out;
  }
  return value;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function executeRun(userId: string, runId: string): Promise<AgentRunWithSteps> {
  let run = await agentRunService.getRun(userId, runId);
  if (TERMINAL_RUN_STATUSES.includes(run.status)) {
    return run;
  }

  const autoExecuteReadOnly = await configService.getBoolean('AGENT_AUTO_EXECUTE_READ_ONLY', true);
  const maxExecutionMs = await configService.getNumber('AGENT_MAX_EXECUTION_TIME_MS', 120000);
  const defaultToolTimeoutMs = await configService.getNumber('AGENT_TOOL_TIMEOUT_MS', 20000);

  const ctx: AgentToolContext = { userId: run.userId, projectId: run.projectId || undefined };
  const runStartedAt = run.createdAt.getTime();
  const orderedSteps = [...run.steps].sort((a, b) => a.stepIndex - b.stepIndex);

  for (const step of orderedSteps) {
    if (TERMINAL_STEP_STATUSES.includes(step.status)) {
      continue; // already resolved by a prior invocation of this engine
    }

    if (Date.now() - runStartedAt > maxExecutionMs) {
      await prisma.agentPlanStep.updateMany({
        where: { agentRunId: run.id, status: { in: ['PENDING', 'APPROVED'] } },
        data: { status: 'SKIPPED' }
      });
      run = await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          resultSummary: 'Run exceeded AGENT_MAX_EXECUTION_TIME_MS; remaining steps were skipped.'
        },
        include: { steps: { orderBy: { stepIndex: 'asc' } } }
      });
      await auditService.logEvent({
        actorId: userId,
        action: 'AGENT_RUN_FAILED',
        targetType: 'AGENT_RUN',
        targetId: run.id,
        projectId: run.projectId,
        details: { reason: 'MAX_EXECUTION_TIME_EXCEEDED' }
      });
      return run;
    }

    const tool = getRegisteredTool(step.toolId);
    if (!tool) {
      // Security invariant: this must be unreachable in normal operation — the planner only ever
      // persists registered tool ids (`planner.service.ts` drops anything else before it is ever
      // saved). If a step somehow references an unregistered tool anyway (e.g. constructed
      // directly, bypassing the planner), NEVER call anything — fail the step/run closed and
      // throw, rather than silently continue.
      await prisma.agentPlanStep.update({
        where: { id: step.id },
        data: { status: 'FAILED', errorMessage: 'Unregistered tool id.', completedAt: new Date() }
      });
      await prisma.agentPlanStep.updateMany({
        where: { agentRunId: run.id, status: { in: ['PENDING', 'APPROVED'] } },
        data: { status: 'SKIPPED' }
      });
      run = await prisma.agentRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', resultSummary: `Step ${step.stepIndex} referenced an unregistered tool.` },
        include: { steps: { orderBy: { stepIndex: 'asc' } } }
      });
      await auditService.logEvent({
        actorId: userId,
        action: 'AGENT_RUN_FAILED',
        targetType: 'AGENT_RUN',
        targetId: run.id,
        projectId: run.projectId,
        details: { reason: 'UNREGISTERED_TOOL', toolId: step.toolId }
      });
      throw new SecurityError(`Refusing to execute unregistered tool id "${step.toolId}".`);
    }

    const autoExecutable = step.riskLevel === 'READ_ONLY' && autoExecuteReadOnly;
    if (!autoExecutable && step.approvalDecision !== 'APPROVED') {
      // Hard stop: never auto-execute a MEDIUM/HIGH/CRITICAL step (or, with the auto-execute
      // flag off, a READ_ONLY one) without an explicit human approval record. Do not skip ahead.
      if (run.status !== 'AWAITING_APPROVAL') {
        run = await prisma.agentRun.update({
          where: { id: run.id },
          data: { status: 'AWAITING_APPROVAL' },
          include: { steps: { orderBy: { stepIndex: 'asc' } } }
        });
      }
      return run;
    }

    const idempotencyKey = computeIdempotencyKey(step.id, step.toolId);
    const existingExecution = await prisma.agentToolExecution.findUnique({ where: { idempotencyKey } });

    if (existingExecution?.success) {
      // A retry of the SAME step never double-invokes a non-idempotent tool (e.g. ClickUp/
      // Calendar creation) — reuse the persisted result instead.
      await prisma.agentPlanStep.update({
        where: { id: step.id },
        data: {
          status: 'SUCCEEDED',
          outputJson: existingExecution.responseJson as any,
          startedAt: step.startedAt || existingExecution.createdAt,
          completedAt: new Date()
        }
      });
      continue;
    }

    await prisma.agentPlanStep.update({
      where: { id: step.id },
      data: { status: 'EXECUTING', startedAt: new Date() }
    });

    const timeoutMs = tool.timeoutMs || defaultToolTimeoutMs;
    const attemptStartedAt = Date.now();
    const scrubbedRequest = scrubForPersistence(step.inputJson || {});

    try {
      const result = await withTimeout(tool.execute(ctx, (step.inputJson as any) || {}), timeoutMs, `Tool "${tool.id}"`);
      const durationMs = Date.now() - attemptStartedAt;
      const scrubbedResponse = scrubForPersistence(result);

      try {
        await prisma.agentToolExecution.create({
          data: {
            agentPlanStepId: step.id,
            toolId: step.toolId,
            idempotencyKey,
            requestJson: scrubbedRequest as any,
            responseJson: scrubbedResponse as any,
            success: true,
            durationMs
          }
        });
      } catch (persistErr) {
        // Concurrent-retry unique constraint race — non-fatal, the step outcome below still holds.
        console.warn(`[execution-engine] Failed to persist AgentToolExecution for step ${step.id}:`, persistErr);
      }

      await prisma.agentPlanStep.update({
        where: { id: step.id },
        data: { status: 'SUCCEEDED', outputJson: scrubbedResponse as any, completedAt: new Date() }
      });
    } catch (err: any) {
      const durationMs = Date.now() - attemptStartedAt;
      const errorMessage = String(err?.message || 'Tool execution failed').slice(0, 2000);

      try {
        await prisma.agentToolExecution.create({
          data: {
            agentPlanStepId: step.id,
            toolId: step.toolId,
            idempotencyKey,
            requestJson: scrubbedRequest as any,
            responseJson: undefined,
            success: false,
            errorMessage,
            durationMs
          }
        });
      } catch (persistErr) {
        console.warn(`[execution-engine] Failed to persist failed AgentToolExecution for step ${step.id}:`, persistErr);
      }

      await prisma.agentPlanStep.update({
        where: { id: step.id },
        data: { status: 'FAILED', errorMessage, completedAt: new Date() }
      });

      // Conservative choice: stop the whole run on any genuine step failure rather than infer
      // which later steps are safe to still run (no dependency-graph analysis in this slice).
      await prisma.agentPlanStep.updateMany({
        where: { agentRunId: run.id, status: { in: ['PENDING', 'APPROVED'] } },
        data: { status: 'SKIPPED' }
      });

      run = await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          resultSummary: `Step ${step.stepIndex} (${step.toolId}) failed: ${errorMessage}`
        },
        include: { steps: { orderBy: { stepIndex: 'asc' } } }
      });

      await auditService.logEvent({
        actorId: userId,
        action: 'AGENT_RUN_FAILED',
        targetType: 'AGENT_RUN',
        targetId: run.id,
        projectId: run.projectId,
        details: { reason: 'STEP_FAILED', stepIndex: step.stepIndex, toolId: step.toolId }
      });

      return run;
    }
  }

  const finalRun = await prisma.agentRun.update({
    where: { id: run.id },
    data: { status: 'COMPLETED', resultSummary: `Completed ${orderedSteps.length} step(s) successfully.` },
    include: { steps: { orderBy: { stepIndex: 'asc' } } }
  });

  await auditService.logEvent({
    actorId: userId,
    action: 'AGENT_RUN_COMPLETED',
    targetType: 'AGENT_RUN',
    targetId: finalRun.id,
    projectId: finalRun.projectId,
    details: { stepCount: orderedSteps.length }
  });

  return finalRun;
}

export const executionEngineService = { executeRun };
