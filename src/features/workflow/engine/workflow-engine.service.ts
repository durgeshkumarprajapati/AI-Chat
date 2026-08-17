import { workflowRepository } from '../repository/workflow.repository';
import { workflowNodeExecutor } from './workflow-node-executor';
import { workflowValidatorService } from '../validation/workflow-validator.service';
import { WorkflowExecutionContext } from './workflow-execution-context';
import { workflowRetryService } from './workflow-retry.service';
import { WORKFLOW_CONFIG } from '../workflow.constants';
import { CanonicalWorkflowDefinition, WorkflowRunNodeStatus, WorkflowRunStatus } from '../workflow.types';
import { NotFoundError, ValidationError } from '@/errors';

export class WorkflowEngineService {
  public async executeWorkflow(
    userId: string,
    workflowId: string,
    initialInput?: Record<string, unknown>,
    idempotencyKey?: string
  ): Promise<string> {
    const workflow = await workflowRepository.getWorkflowById(workflowId, userId);
    if (!workflow) throw new NotFoundError('Workflow not found or unauthorized.');

    const activeVersion = workflow.versions.find((v) => v.id === workflow.activeVersionId) || workflow.versions[0];
    if (!activeVersion) throw new ValidationError('Workflow has no published active version.');

    const definition = activeVersion.definition as unknown as CanonicalWorkflowDefinition;
    workflowValidatorService.assertValidDefinition(definition);

    // Create Run
    const run = await workflowRepository.createRun({
      workflowId,
      versionId: activeVersion.id,
      userId,
      triggerType: (workflow.triggers[0]?.type as any) || 'MANUAL',
      idempotencyKey,
      input: initialInput
    });

    const context = new WorkflowExecutionContext({
      runId: run.id,
      workflowId,
      versionId: activeVersion.id,
      userId,
      initialInput
    });

    // Start Execution Loop asynchronously
    this.runExecutionLoop(run.id, definition, context).catch((err) => {
      console.error(`[WorkflowEngine] Background run execution error for ${run.id}:`, err);
    });

    return run.id;
  }

  public async runExecutionLoop(
    runId: string,
    definition: CanonicalWorkflowDefinition,
    context: WorkflowExecutionContext
  ): Promise<void> {
    await workflowRepository.updateRunStatus(runId, WorkflowRunStatus.RUNNING);

    const nodes = definition.nodes;
    const edges = definition.edges;

    // Find trigger / start node
    let currentNode = nodes.find((n) => n.type === 'MANUAL' || n.type === 'DOCUMENT_UPLOADED' || n.type === 'SCHEDULED' || n.type === 'WEBHOOK') || nodes[0];

    let stepsUsed = 0;
    const maxSteps = WORKFLOW_CONFIG.SERVER_ABSOLUTE_MAX_EXECUTION_STEPS;

    while (currentNode && stepsUsed < maxSteps) {
      // Cancellation check
      const currentRun = await workflowRepository.getRunById(runId, context.userId);
      if (currentRun?.status === WorkflowRunStatus.CANCELLED) {
        return;
      }
      if (currentRun?.status === WorkflowRunStatus.PAUSED) {
        return;
      }

      const nodeKey = currentNode.key;
      await workflowRepository.saveRunNode({
        runId,
        nodeKey,
        status: WorkflowRunNodeStatus.RUNNING,
        input: context.getScope()
      });

      let attempt = 1;
      let success = false;
      let nodeResult: { success: boolean; output: Record<string, unknown>; error?: string } = { success: false, output: {} };

      while (attempt <= WORKFLOW_CONFIG.SERVER_ABSOLUTE_MAX_RETRIES + 1) {
        nodeResult = await workflowNodeExecutor.executeNode(nodeKey, currentNode.type, currentNode.config || {}, context);

        if (nodeResult.success) {
          success = true;
          break;
        }

        if (workflowRetryService.isRetryableError(nodeResult.error) && attempt <= WORKFLOW_CONFIG.SERVER_ABSOLUTE_MAX_RETRIES) {
          await workflowRepository.saveRunNode({
            runId,
            nodeKey,
            status: WorkflowRunNodeStatus.RETRYING,
            attempt: attempt + 1,
            error: nodeResult.error
          });
          const backoff = workflowRetryService.getBackoffDelayMs(attempt);
          await new Promise((res) => setTimeout(res, backoff));
          attempt++;
        } else {
          break;
        }
      }

      stepsUsed++;

      if (success) {
        context.setNodeOutput(nodeKey, nodeResult.output);
        await workflowRepository.saveRunNode({
          runId,
          nodeKey,
          status: WorkflowRunNodeStatus.COMPLETED,
          output: nodeResult.output,
          attempt
        });

        // Determine next node based on edges & condition branch if CONDITION node
        const outgoingEdges = edges.filter((e) => e.source === nodeKey);
        if (outgoingEdges.length === 0) break;

        let nextEdge = outgoingEdges[0];
        if (currentNode.type === 'CONDITION') {
          const branch = String(nodeResult.output.branch || 'YES');
          nextEdge = outgoingEdges.find((e) => (e.condition || e.sourceHandle)?.toUpperCase() === branch) || outgoingEdges[0];
        }

        currentNode = nodes.find((n) => n.key === nextEdge?.target);
      } else {
        await workflowRepository.saveRunNode({
          runId,
          nodeKey,
          status: WorkflowRunNodeStatus.FAILED,
          error: nodeResult.error,
          attempt
        });

        await workflowRepository.updateRunStatus(runId, WorkflowRunStatus.FAILED, {
          error: nodeResult.error || `Node ${nodeKey} failed.`,
          stepCount: stepsUsed,
          completedAt: new Date()
        });
        return;
      }
    }

    const finalStatus = stepsUsed >= maxSteps ? WorkflowRunStatus.LIMIT_REACHED : WorkflowRunStatus.COMPLETED;
    await workflowRepository.updateRunStatus(runId, finalStatus, {
      output: context.getScope(),
      stepCount: stepsUsed,
      completedAt: new Date()
    });
  }
}

export const workflowEngineService = new WorkflowEngineService();
