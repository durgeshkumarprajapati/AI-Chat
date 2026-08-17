import { workflowRepository } from '../repository/workflow.repository';
import { WorkflowRunStatus } from '../workflow.types';

export class WorkflowCancellationService {
  public async cancelRun(runId: string, userId: string): Promise<{ success: boolean; message: string }> {
    const run = await workflowRepository.getRunById(runId, userId);
    if (!run) throw new Error('Workflow run not found');

    if (['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT'].includes(run.status)) {
      return { success: false, message: `Run is already in terminal status ${run.status}.` };
    }

    await workflowRepository.updateRunStatus(runId, WorkflowRunStatus.CANCELLED, {
      error: 'Execution cancelled by user.',
      completedAt: new Date()
    });

    return { success: true, message: 'Workflow run cancelled.' };
  }
}

export const workflowCancellationService = new WorkflowCancellationService();
