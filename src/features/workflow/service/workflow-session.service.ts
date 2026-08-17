import { workflowRepository } from '../repository/workflow.repository';
import { workflowEngineService } from '../engine/workflow-engine.service';
import { workflowCancellationService } from '../engine/workflow-cancellation.service';
import { aiWorkflowGeneratorService } from '../ai-generator/ai-workflow-generator.service';
import { workflowValidatorService } from '../validation/workflow-validator.service';
import { workflowCacheService } from '../cache/workflow-cache.service';
import { CanonicalWorkflowDefinition, CreateWorkflowInput, WorkflowStatus } from '../workflow.types';
import { AuthorizationError, NotFoundError } from '@/errors';
import { prisma } from '@/lib/prisma';

export class WorkflowSessionService {
  public async createWorkflow(userId: string, input: CreateWorkflowInput) {
    return workflowRepository.createWorkflow({
      userId,
      name: input.name,
      description: input.description,
      definition: input.definition,
      variables: input.variables,
      triggers: input.triggers
    });
  }

  public async generateWorkflowWithAI(userId: string, prompt: string, name?: string) {
    const definition = await aiWorkflowGeneratorService.generateWorkflowFromPrompt(prompt);
    return this.createWorkflow(userId, {
      name: name || `AI Workflow: ${prompt.slice(0, 30)}`,
      description: prompt,
      definition
    });
  }

  public async publishWorkflow(userId: string, workflowId: string, definition: CanonicalWorkflowDefinition) {
    workflowValidatorService.assertValidDefinition(definition);
    const updated = await workflowRepository.publishVersion(workflowId, userId, definition);
    await workflowCacheService.invalidate(userId, `workflow:${workflowId}`);
    return updated;
  }

  public async getWorkflowDetails(userId: string, workflowId: string) {
    const cached = await workflowCacheService.get<any>(userId, `workflow:${workflowId}`);
    if (cached) return cached;

    const workflow = await workflowRepository.getWorkflowById(workflowId, userId);
    if (!workflow) throw new NotFoundError('Workflow not found or unauthorized.');

    await workflowCacheService.set(userId, `workflow:${workflowId}`, workflow, 300);
    return workflow;
  }

  public async getUserWorkflows(userId: string) {
    return workflowRepository.getUserWorkflows(userId);
  }

  public async duplicateWorkflow(userId: string, workflowId: string, name?: string) {
    const source = await this.getWorkflowDetails(userId, workflowId);
    const activeVersion = source.versions.find((v: any) => v.id === source.activeVersionId) || source.versions[0];
    const def = (activeVersion?.definition as unknown as CanonicalWorkflowDefinition) || { version: 1, nodes: [], edges: [] };

    return this.createWorkflow(userId, {
      name: name || `${source.name} (Copy)`,
      description: source.description || undefined,
      definition: def
    });
  }

  public async executeWorkflow(userId: string, workflowId: string, input?: Record<string, unknown>) {
    return workflowEngineService.executeWorkflow(userId, workflowId, input);
  }

  public async cancelRun(userId: string, runId: string) {
    return workflowCancellationService.cancelRun(runId, userId);
  }

  public async getAdminMetrics(adminUserId: string) {
    const user = await prisma.user.findUnique({ where: { id: adminUserId } });
    if (!user || user.role !== 'ADMIN') {
      throw new AuthorizationError('Admin privileges required.');
    }

    const [totalWorkflows, publishedWorkflows, totalRuns, completedRuns, failedRuns] = await Promise.all([
      prisma.workflow.count(),
      prisma.workflow.count({ where: { status: WorkflowStatus.PUBLISHED } }),
      prisma.workflowRun.count(),
      prisma.workflowRun.count({ where: { status: 'COMPLETED' as any } }),
      prisma.workflowRun.count({ where: { status: 'FAILED' as any } })
    ]);

    return {
      totalWorkflows,
      publishedWorkflows,
      totalRuns,
      completedRuns,
      failedRuns,
      successRate: totalRuns > 0 ? Math.round((completedRuns / totalRuns) * 100) : 100
    };
  }
}

export const workflowSessionService = new WorkflowSessionService();
