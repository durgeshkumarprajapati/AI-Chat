import { Automation, AutomationExecution, AutomationExecutionStep, AutomationStepStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { auditService } from '@/features/audit/audit.service';
import { llmGateway } from '@/features/llm/llm-gateway.service';
import { notificationService } from '@/features/notifications/notification.service';
import { agentRunService } from '@/features/ai-agent/agent-run.service';
import { executionEngineService } from '@/features/ai-agent/execution-engine.service';
import { AUTOMATION_NODE_REGISTRY } from '../nodes/automation-node.registry';
import { sanitizeForStorage } from '../security/automation-sanitize';
import { wrapUntrustedWorkflowContext } from '../security/untrusted-workflow-context';
import { AutomationDefinition, AutomationDefinitionEdge, AutomationDefinitionNode, AutomationEdgeCondition } from '../automation.types';

const TERMINAL_EXECUTION_STATUSES = ['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED'];
const TERMINAL_STEP_STATUSES: AutomationStepStatus[] = ['SUCCEEDED', 'FAILED', 'SKIPPED', 'CANCELLED'];
const MAX_GRAPH_ITERATIONS = 500;

interface WalkContext {
  trigger: Record<string, unknown>;
  steps: Record<string, unknown>;
}

interface NodeHandlerResult {
  status: 'SUCCEEDED' | 'FAILED' | 'WAITING_APPROVAL';
  output: unknown;
  errorMessage?: string;
}

function resolveDotPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function renderTemplate(template: string, context: WalkContext): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    const value = resolveDotPath(context, path);
    if (value === undefined || value === null) return '';
    return typeof value === 'string' ? value : JSON.stringify(value);
  });
}

function evaluateCondition(condition: AutomationEdgeCondition, context: WalkContext): boolean {
  const value = resolveDotPath(context, condition.path);
  switch (condition.op) {
    case 'eq':
      return value === condition.value;
    case 'neq':
      return value !== condition.value;
    case 'gt':
      return typeof value === 'number' && typeof condition.value === 'number' && value > condition.value;
    case 'gte':
      return typeof value === 'number' && typeof condition.value === 'number' && value >= condition.value;
    case 'lt':
      return typeof value === 'number' && typeof condition.value === 'number' && value < condition.value;
    case 'lte':
      return typeof value === 'number' && typeof condition.value === 'number' && value <= condition.value;
    case 'contains':
      if (typeof value === 'string' && typeof condition.value === 'string') return value.includes(condition.value);
      if (Array.isArray(value)) return value.includes(condition.value);
      return false;
    case 'exists':
      return value !== undefined && value !== null;
    default:
      return false;
  }
}

/**
 * Phase 88 — the Automation Execution Engine.
 *
 * Walks a bounded, closed node graph (TRIGGER -> ... -> END), never trusting anything from the
 * triggering RabbitMQ job payload beyond `executionId` — every node's actual behavior is reloaded
 * fresh from Postgres (the AutomationExecution row + its AutomationVersion.definition) on every
 * invocation, so a duplicate/retried job, or a resume-after-approval invocation, always starts
 * from ground truth rather than a possibly-stale in-memory/queue-payload state.
 *
 * For any node that ultimately needs to call a tool or run an AI step (AI_ANALYSIS, AI_AGENT,
 * APPROVAL, CLICKUP_ACTION, CALENDAR_ACTION), this engine NEVER calls a tool's execute() directly
 * and NEVER reimplements approval-gating — AI_AGENT/APPROVAL/CLICKUP_ACTION/CALENDAR_ACTION all
 * go through agentRunService.createRun + executionEngineService.executeRun (the exact, unmodified
 * Phase 87 AI Agent platform), scoped to the Automation's own owner userId + projectId.
 */
export class AutomationEngineService {
  public async runExecution(executionId: string): Promise<void> {
    const execution = await prisma.automationExecution.findUnique({
      where: { id: executionId },
      include: { version: true, automation: true, steps: { orderBy: { createdAt: 'asc' } } }
    });
    if (!execution) {
      console.warn(`[AutomationEngine] Execution "${executionId}" not found; discarding.`);
      return;
    }
    if (TERMINAL_EXECUTION_STATUSES.includes(execution.status)) {
      return; // already resolved by a prior invocation — safe no-op for a duplicate delivery
    }

    const maxExecutionMs = await configService.getNumber('WORKFLOW_EXECUTION_TIMEOUT_MS', 300000);
    if (Date.now() - execution.createdAt.getTime() > maxExecutionMs) {
      await this.failExecution(execution.id, 'Execution exceeded WORKFLOW_EXECUTION_TIMEOUT_MS.');
      return;
    }

    const definition = execution.version.definition as unknown as AutomationDefinition;
    const nodesByKey = new Map(definition.nodes.map((n) => [n.key, n]));
    const automation = execution.automation;

    if (execution.status === 'QUEUED') {
      await prisma.automationExecution.update({
        where: { id: execution.id },
        data: { status: 'RUNNING', startedAt: execution.startedAt || new Date() }
      });
    }

    const context: WalkContext = {
      trigger: (execution.triggerPayload as Record<string, unknown>) || {},
      steps: {}
    };
    let anyStepFailed = false;
    for (const step of execution.steps) {
      context.steps[step.nodeKey] = step.sanitizedOutput ?? null;
      if (step.status === 'FAILED') anyStepFailed = true;
    }

    let currentNodeKey = this.determineStartNodeKey(execution, definition);
    let iterations = 0;

    while (currentNodeKey) {
      if (++iterations > MAX_GRAPH_ITERATIONS) {
        await this.failExecution(execution.id, 'Execution graph exceeded the maximum iteration count (possible cycle).');
        return;
      }

      const node = nodesByKey.get(currentNodeKey);
      if (!node) {
        await this.failExecution(execution.id, `Execution graph references unknown node "${currentNodeKey}".`);
        return;
      }

      if (node.type === 'END') {
        await this.upsertTerminalStep(execution.id, node, 'SUCCEEDED', { finalStatus: anyStepFailed ? 'PARTIALLY_COMPLETED' : 'COMPLETED' });
        await this.completeExecution(execution.id, anyStepFailed);
        return;
      }

      const existingStep = await prisma.automationExecutionStep.findFirst({
        where: { executionId: execution.id, nodeKey: node.key }
      });

      if (existingStep && TERMINAL_STEP_STATUSES.includes(existingStep.status)) {
        // Already resolved by a prior invocation of this engine — move on.
        if (existingStep.status === 'FAILED') anyStepFailed = true;
        context.steps[node.key] = existingStep.sanitizedOutput ?? null;
        const next = this.pickNextNodeKey(definition, node.key, existingStep.status === 'FAILED' ? 'FAILED' : 'SUCCEEDED', context);
        if (!next) {
          if (existingStep.status === 'FAILED') {
            await this.failExecution(execution.id, existingStep.errorMessage || `Node "${node.key}" failed with no recovery edge.`);
            return;
          }
          await this.completeExecution(execution.id, anyStepFailed);
          return;
        }
        currentNodeKey = next;
        continue;
      }

      const result = await this.executeNode(automation, execution, node, context, existingStep);

      if (result.status === 'WAITING_APPROVAL') {
        await prisma.automationExecution.update({ where: { id: execution.id }, data: { status: 'WAITING_APPROVAL' } });
        return; // Never keep the worker waiting for a user — stop walking now.
      }

      context.steps[node.key] = result.output ?? null;
      if (result.status === 'FAILED') anyStepFailed = true;

      const next = this.pickNextNodeKey(definition, node.key, result.status, context);
      if (!next) {
        if (result.status === 'FAILED') {
          await this.failExecution(execution.id, result.errorMessage || `Node "${node.key}" failed with no recovery edge.`);
          return;
        }
        await this.completeExecution(execution.id, anyStepFailed);
        return;
      }
      currentNodeKey = next;
    }

    // Walked off the graph without ever reaching an END node — treat as (partially) complete
    // rather than leave the execution stuck QUEUED/RUNNING forever.
    await this.completeExecution(execution.id, true);
  }

  /** Resume point: the most recently touched non-terminal step's node, or the TRIGGER node if
   * this is the first invocation. */
  private determineStartNodeKey(
    execution: AutomationExecution & { steps: AutomationExecutionStep[] },
    definition: AutomationDefinition
  ): string | null {
    const nonTerminal = [...execution.steps].reverse().find((s) => !TERMINAL_STEP_STATUSES.includes(s.status));
    if (nonTerminal) return nonTerminal.nodeKey;

    if (execution.steps.length > 0) {
      // Every recorded step is terminal already but the loop stopped mid-graph on a prior
      // invocation for some other reason — resume from the last one's own outgoing edge.
      const last = execution.steps[execution.steps.length - 1]!;
      const context: WalkContext = {
        trigger: (execution.triggerPayload as Record<string, unknown>) || {},
        steps: Object.fromEntries(execution.steps.map((s) => [s.nodeKey, s.sanitizedOutput ?? null]))
      };
      return this.pickNextNodeKey(definition, last.nodeKey, last.status === 'FAILED' ? 'FAILED' : 'SUCCEEDED', context);
    }

    const trigger = definition.nodes.find((n) => n.type === 'TRIGGER');
    return trigger ? trigger.key : null;
  }

  private pickNextNodeKey(
    definition: AutomationDefinition,
    fromKey: string,
    status: 'SUCCEEDED' | 'FAILED',
    context: WalkContext
  ): string | null {
    const failing = status === 'FAILED';
    const candidates = definition.edges.filter((e: AutomationDefinitionEdge) => e.from === fromKey && Boolean(e.onFailure) === failing);

    for (const edge of candidates) {
      if (edge.condition && evaluateCondition(edge.condition, context)) return edge.to;
    }
    const defaultEdge = candidates.find((e) => !e.condition);
    return defaultEdge ? defaultEdge.to : null;
  }

  private async executeNode(
    automation: Automation,
    execution: AutomationExecution,
    node: AutomationDefinitionNode,
    context: WalkContext,
    existingStep: AutomationExecutionStep | null
  ): Promise<NodeHandlerResult> {
    const nodeDef = AUTOMATION_NODE_REGISTRY[node.type];
    const config = (node.config ?? {}) as Record<string, unknown>;

    try {
      switch (node.type) {
        case 'TRIGGER':
          return this.finishSimpleNode(execution.id, node, 'SUCCEEDED', context.trigger);

        case 'CONDITION':
          return this.finishSimpleNode(execution.id, node, 'SUCCEEDED', { evaluated: true });

        case 'AI_ANALYSIS': {
          const promptTemplate = typeof config.promptTemplate === 'string' ? config.promptTemplate : '';
          const rendered = renderTemplate(promptTemplate, context);
          const wrapped = [
            rendered,
            wrapUntrustedWorkflowContext(JSON.stringify(context.steps ?? {}), `automation:${automation.id}:${node.key}`)
          ].join('\n\n');
          const timeoutMs = typeof config.timeoutMs === 'number' ? config.timeoutMs : nodeDef.timeoutMs;

          const analysis = await llmGateway.generateStructured<Record<string, unknown>>({
            prompt: wrapped,
            feature: 'AGENT',
            userId: automation.userId,
            timeoutMs,
            schemaDescription: 'A JSON object containing the requested analysis result.',
            exampleJson: '{}'
          });
          return this.finishSimpleNode(execution.id, node, 'SUCCEEDED', analysis);
        }

        case 'AI_AGENT': {
          const goalTemplate = typeof config.goalTemplate === 'string' ? config.goalTemplate : '';
          const goal = renderTemplate(goalTemplate, context);
          return this.runAgentBackedNode(automation, execution, node, existingStep, goal);
        }

        case 'APPROVAL': {
          const goalTemplate = typeof config.goalTemplate === 'string' && config.goalTemplate.trim()
            ? config.goalTemplate
            : `Review and approve the pending action for automation "${automation.name}" (node "${node.key}").`;
          const goal = renderTemplate(goalTemplate, context);
          return this.runAgentBackedNode(automation, execution, node, existingStep, goal);
        }

        case 'CLICKUP_ACTION': {
          const goal = this.buildClickUpGoal(config, context);
          return this.runAgentBackedNode(automation, execution, node, existingStep, goal);
        }

        case 'CALENDAR_ACTION': {
          const goal = this.buildCalendarGoal(config, context);
          return this.runAgentBackedNode(automation, execution, node, existingStep, goal);
        }

        case 'NOTIFICATION': {
          const titleTemplate = typeof config.titleTemplate === 'string' ? config.titleTemplate : 'Automation notification';
          const bodyTemplate = typeof config.bodyTemplate === 'string' ? config.bodyTemplate : '';
          const title = renderTemplate(titleTemplate, context);
          const body = renderTemplate(bodyTemplate, context);

          const notification = await notificationService.createNotification({
            userId: automation.userId,
            type: 'AUTOMATION_EXECUTION_NOTIFICATION',
            title,
            body,
            priority: 'NORMAL',
            projectId: automation.projectId,
            dedupeKey: `automation:v1:${execution.id}:notification:${node.key}`,
            metadata: { executionId: execution.id, automationId: automation.id, nodeKey: node.key }
          });
          return this.finishSimpleNode(execution.id, node, 'SUCCEEDED', { notificationId: notification?.id ?? null });
        }

        case 'DELAY':
          return this.runDelayNode(execution, node, config, existingStep);

        default:
          return this.finishSimpleNode(execution.id, node, 'FAILED', null, `Unregistered node type "${node.type}".`);
      }
    } catch (err: any) {
      if (err instanceof DelayNotYetDueError) throw err; // not a failure — see runDelayNode()
      const errorMessage = String(err?.message || 'Automation node execution failed').slice(0, 2000);
      await this.persistStep(execution.id, node, 'FAILED', existingStep, null, errorMessage);
      return { status: 'FAILED', output: null, errorMessage };
    }
  }

  private async runAgentBackedNode(
    automation: Automation,
    execution: AutomationExecution,
    node: AutomationDefinitionNode,
    existingStep: AutomationExecutionStep | null,
    goal: string
  ): Promise<NodeHandlerResult> {
    const step = existingStep ?? (await this.persistStep(execution.id, node, 'RUNNING', null, {}));
    let agentRunId = (step.sanitizedOutput as Record<string, unknown> | null)?.agentRunId as string | undefined;

    // Idempotent: only ever create ONE AgentRun per (execution, node) — a re-invocation (retry,
    // resume-after-approval) reuses the already-created run rather than double-creating it.
    if (!agentRunId) {
      const run = await agentRunService.createRun(automation.userId, goal, automation.projectId ?? undefined);
      agentRunId = run.id;
      await prisma.automationExecutionStep.update({
        where: { id: step.id },
        data: { sanitizedOutput: sanitizeForStorage({ agentRunId }) as any }
      });
      await prisma.automationExecution.update({ where: { id: execution.id }, data: { agentRunId } });
    }

    const run = await executionEngineService.executeRun(automation.userId, agentRunId);

    if (run.status === 'AWAITING_APPROVAL') {
      await prisma.automationExecutionStep.update({
        where: { id: step.id },
        data: { status: 'WAITING_APPROVAL', sanitizedOutput: sanitizeForStorage({ agentRunId, runStatus: run.status }) as any }
      });
      return { status: 'WAITING_APPROVAL', output: { agentRunId } };
    }

    if (run.status === 'COMPLETED') {
      const output = { agentRunId, runStatus: run.status, resultSummary: run.resultSummary };
      await prisma.automationExecutionStep.update({
        where: { id: step.id },
        data: { status: 'SUCCEEDED', sanitizedOutput: sanitizeForStorage(output) as any, completedAt: new Date() }
      });
      return { status: 'SUCCEEDED', output };
    }

    const errorMessage = run.resultSummary || `Underlying agent run ended with status ${run.status}.`;
    await prisma.automationExecutionStep.update({
      where: { id: step.id },
      data: {
        status: 'FAILED',
        errorMessage,
        sanitizedOutput: sanitizeForStorage({ agentRunId, runStatus: run.status }) as any,
        completedAt: new Date()
      }
    });
    return { status: 'FAILED', output: { agentRunId, runStatus: run.status }, errorMessage };
  }

  /**
   * RabbitMQ has no native delay. Rather than block the worker with an in-process sleep, this
   * records `nextRunAt` on the step and returns FAILED-free/incomplete — the worker's periodic
   * tick (see worker/src/index.ts, WORKFLOW_TRIGGER_SCHEDULER_INTERVAL_MS) re-invokes
   * runExecution() once the time has come, which re-enters this same branch and, seeing the delay
   * has elapsed, marks the step SUCCEEDED and lets the walk continue.
   */
  private async runDelayNode(
    execution: AutomationExecution,
    node: AutomationDefinitionNode,
    config: Record<string, unknown>,
    existingStep: AutomationExecutionStep | null
  ): Promise<NodeHandlerResult> {
    if (existingStep) {
      const nextRunAtRaw = (existingStep.sanitizedOutput as Record<string, unknown> | null)?.nextRunAt;
      const nextRunAt = typeof nextRunAtRaw === 'string' ? new Date(nextRunAtRaw) : null;
      if (nextRunAt && Date.now() >= nextRunAt.getTime()) {
        await prisma.automationExecutionStep.update({
          where: { id: existingStep.id },
          data: { status: 'SUCCEEDED', completedAt: new Date() }
        });
        return { status: 'SUCCEEDED', output: { nextRunAt: nextRunAtRaw } };
      }
      // Not yet due — signal the caller to stop walking without resolving this node.
      throw new DelayNotYetDueError();
    }

    const delayMs = typeof config.delayMs === 'number' && config.delayMs > 0 ? config.delayMs : 60000;
    const nextRunAt = new Date(Date.now() + delayMs).toISOString();
    await this.persistStep(execution.id, node, 'RUNNING', null, { nextRunAt });
    throw new DelayNotYetDueError();
  }

  private async finishSimpleNode(
    executionId: string,
    node: AutomationDefinitionNode,
    status: 'SUCCEEDED' | 'FAILED',
    output: unknown,
    errorMessage?: string
  ): Promise<NodeHandlerResult> {
    await this.persistStep(executionId, node, status, null, output, errorMessage);
    return { status, output, errorMessage };
  }

  private async persistStep(
    executionId: string,
    node: AutomationDefinitionNode,
    status: AutomationStepStatus,
    existingStep: AutomationExecutionStep | null,
    output: unknown,
    errorMessage?: string
  ): Promise<AutomationExecutionStep> {
    const sanitizedOutput = sanitizeForStorage(output) as any;
    const isTerminal = TERMINAL_STEP_STATUSES.includes(status);
    if (existingStep) {
      return prisma.automationExecutionStep.update({
        where: { id: existingStep.id },
        data: {
          status,
          sanitizedOutput,
          errorMessage: errorMessage ?? null,
          completedAt: isTerminal ? new Date() : null
        }
      });
    }
    return prisma.automationExecutionStep.create({
      data: {
        executionId,
        nodeKey: node.key,
        nodeType: node.type,
        status,
        sanitizedOutput,
        errorMessage: errorMessage ?? null,
        startedAt: new Date(),
        completedAt: isTerminal ? new Date() : null
      }
    });
  }

  private async upsertTerminalStep(
    executionId: string,
    node: AutomationDefinitionNode,
    status: AutomationStepStatus,
    output: unknown
  ): Promise<void> {
    const existing = await prisma.automationExecutionStep.findFirst({ where: { executionId, nodeKey: node.key } });
    await this.persistStep(executionId, node, status, existing, output);
  }

  private buildClickUpGoal(config: Record<string, unknown>, context: WalkContext): string {
    const action = config.action === 'update' ? 'update' : 'create';
    const name = typeof config.nameTemplate === 'string' ? renderTemplate(config.nameTemplate, context) : '';
    const description =
      typeof config.descriptionTemplate === 'string' ? renderTemplate(config.descriptionTemplate, context) : '';

    if (action === 'create') {
      const listId = String(config.listId ?? '');
      return [
        `Create a new ClickUp task in list "${listId}" titled "${name || 'Automated task'}" using the create_clickup_task tool.`,
        description ? `Set its description to: ${description}` : ''
      ]
        .filter(Boolean)
        .join(' ');
    }

    const taskId = String(config.taskId ?? '');
    return [
      `Update ClickUp task "${taskId}" using the update_clickup_task tool.`,
      name ? `Set its name to "${name}".` : '',
      description ? `Set its description to: ${description}` : ''
    ]
      .filter(Boolean)
      .join(' ');
  }

  private buildCalendarGoal(config: Record<string, unknown>, context: WalkContext): string {
    const title = typeof config.titleTemplate === 'string' ? renderTemplate(config.titleTemplate, context) : 'Automated event';
    const startTime = typeof config.startTimeTemplate === 'string' ? renderTemplate(config.startTimeTemplate, context) : '';
    const endTime = typeof config.endTimeTemplate === 'string' ? renderTemplate(config.endTimeTemplate, context) : '';
    const description =
      typeof config.descriptionTemplate === 'string' ? renderTemplate(config.descriptionTemplate, context) : '';

    return [
      `Create a new Google Calendar event titled "${title}" starting at ${startTime} and ending at ${endTime} using the create_calendar_event tool.`,
      description ? `Set its description to: ${description}` : ''
    ]
      .filter(Boolean)
      .join(' ');
  }

  private async completeExecution(executionId: string, anyStepFailed: boolean): Promise<void> {
    const status = anyStepFailed ? 'PARTIALLY_COMPLETED' : 'COMPLETED';
    await prisma.automationExecution.update({
      where: { id: executionId },
      data: { status, completedAt: new Date() }
    });
    await auditService.logEvent({
      actorId: 'SYSTEM',
      action: 'AUTOMATION_EXECUTION_COMPLETED',
      targetType: 'AUTOMATION_EXECUTION',
      targetId: executionId,
      details: { status }
    });
  }

  private async failExecution(executionId: string, errorMessage: string): Promise<void> {
    await prisma.automationExecutionStep.updateMany({
      where: { executionId, status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'SKIPPED' }
    });
    await prisma.automationExecution.update({
      where: { id: executionId },
      data: { status: 'FAILED', errorMessage: errorMessage.slice(0, 2000), completedAt: new Date() }
    });
    await auditService.logEvent({
      actorId: 'SYSTEM',
      action: 'AUTOMATION_EXECUTION_FAILED',
      targetType: 'AUTOMATION_EXECUTION',
      targetId: executionId,
      details: { errorMessage }
    });
  }
}

/** Internal control-flow signal only — never escapes runExecution(). Thrown by runDelayNode() to
 * unwind out of executeNode()'s try/catch without marking the DELAY step FAILED (the delay simply
 * hasn't elapsed yet; the step stays RUNNING and the periodic tick will retry later). */
class DelayNotYetDueError extends Error {}

export const automationEngineService = {
  runExecution: async (executionId: string): Promise<void> => {
    const engine = new AutomationEngineService();
    try {
      await engine.runExecution(executionId);
    } catch (err) {
      if (err instanceof DelayNotYetDueError) return; // expected — stop walking silently
      throw err;
    }
  }
};
