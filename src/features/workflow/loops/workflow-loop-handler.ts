import { WORKFLOW_CONFIG } from '../workflow.constants';

export class WorkflowLoopHandler {
  public executeLoop<T>(
    items: T[],
    maxIterationsConfig: number | undefined,
    bodyHandler: (_item: T, _index: number) => void | boolean
  ): { executedCount: number; limitReached: boolean } {
    if (!Array.isArray(items) || items.length === 0) {
      return { executedCount: 0, limitReached: false };
    }

    const maxLimit = Math.min(
      maxIterationsConfig || WORKFLOW_CONFIG.SERVER_ABSOLUTE_MAX_LOOP_ITERATIONS,
      WORKFLOW_CONFIG.SERVER_ABSOLUTE_MAX_LOOP_ITERATIONS
    );

    let executedCount = 0;
    let limitReached = false;

    for (let i = 0; i < items.length; i++) {
      if (executedCount >= maxLimit) {
        limitReached = true;
        break;
      }

      const shouldContinue = bodyHandler(items[i]!, i);
      executedCount++;

      if (shouldContinue === false) break;
    }

    return { executedCount, limitReached };
  }
}

export const workflowLoopHandler = new WorkflowLoopHandler();
