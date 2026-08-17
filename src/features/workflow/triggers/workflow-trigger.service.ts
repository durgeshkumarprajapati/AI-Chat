import { workflowEngineService } from '../engine/workflow-engine.service';
import { WorkflowTriggerType } from '../workflow.types';
import { prisma } from '@/lib/prisma';

export class WorkflowTriggerService {
  /**
   * Called when a document is uploaded and ready in the document processing pipeline.
   */
  public async handleDocumentUploadedTrigger(userId: string, documentId: string, filename: string): Promise<string[]> {
    const matchingTriggers = await prisma.workflowTrigger.findMany({
      where: {
        type: WorkflowTriggerType.DOCUMENT_UPLOADED,
        enabled: true,
        workflow: { userId }
      },
      include: { workflow: true }
    });

    const runIds: string[] = [];

    for (const tr of matchingTriggers) {
      if (!tr.workflow.activeVersionId) continue;
      const idempotencyKey = `doc_uploaded:${documentId}:${tr.workflowId}`;

      try {
        const runId = await workflowEngineService.executeWorkflow(
          userId,
          tr.workflowId,
          { documentId, filename },
          idempotencyKey
        );
        runIds.push(runId);

        await prisma.workflowTrigger.update({
          where: { id: tr.id },
          data: { lastExecutedAt: new Date() }
        });
      } catch (err) {
        console.error(`[WorkflowTrigger] Trigger execution failed for workflow ${tr.workflowId}:`, err);
      }
    }

    return runIds;
  }
}

export const workflowTriggerService = new WorkflowTriggerService();
