import { WorkflowRunStatus, WorkflowRunNodeStatus } from '../workflow.types';

export const RUN_STATE_TRANSITIONS: Record<WorkflowRunStatus, WorkflowRunStatus[]> = {
  [WorkflowRunStatus.QUEUED]: [WorkflowRunStatus.RUNNING, WorkflowRunStatus.CANCELLED, WorkflowRunStatus.FAILED],
  [WorkflowRunStatus.RUNNING]: [
    WorkflowRunStatus.PAUSED,
    WorkflowRunStatus.WAITING,
    WorkflowRunStatus.COMPLETED,
    WorkflowRunStatus.FAILED,
    WorkflowRunStatus.CANCELLED,
    WorkflowRunStatus.TIMEOUT,
    WorkflowRunStatus.LIMIT_REACHED
  ],
  [WorkflowRunStatus.PAUSED]: [WorkflowRunStatus.RUNNING, WorkflowRunStatus.CANCELLED],
  [WorkflowRunStatus.WAITING]: [WorkflowRunStatus.RUNNING, WorkflowRunStatus.CANCELLED, WorkflowRunStatus.TIMEOUT],
  [WorkflowRunStatus.COMPLETED]: [],
  [WorkflowRunStatus.FAILED]: [],
  [WorkflowRunStatus.CANCELLED]: [],
  [WorkflowRunStatus.TIMEOUT]: [],
  [WorkflowRunStatus.LIMIT_REACHED]: []
};

export const RUN_NODE_STATE_TRANSITIONS: Record<WorkflowRunNodeStatus, WorkflowRunNodeStatus[]> = {
  [WorkflowRunNodeStatus.PENDING]: [WorkflowRunNodeStatus.READY, WorkflowRunNodeStatus.SKIPPED, WorkflowRunNodeStatus.CANCELLED],
  [WorkflowRunNodeStatus.READY]: [WorkflowRunNodeStatus.RUNNING, WorkflowRunNodeStatus.CANCELLED],
  [WorkflowRunNodeStatus.RUNNING]: [
    WorkflowRunNodeStatus.COMPLETED,
    WorkflowRunNodeStatus.FAILED,
    WorkflowRunNodeStatus.RETRYING,
    WorkflowRunNodeStatus.SKIPPED,
    WorkflowRunNodeStatus.CANCELLED
  ],
  [WorkflowRunNodeStatus.RETRYING]: [WorkflowRunNodeStatus.RUNNING, WorkflowRunNodeStatus.FAILED, WorkflowRunNodeStatus.CANCELLED],
  [WorkflowRunNodeStatus.COMPLETED]: [],
  [WorkflowRunNodeStatus.FAILED]: [],
  [WorkflowRunNodeStatus.SKIPPED]: [],
  [WorkflowRunNodeStatus.CANCELLED]: []
};

export class WorkflowStateMachine {
  public static canRunTransition(current: WorkflowRunStatus, next: WorkflowRunStatus): boolean {
    if (current === next) return true;
    const allowed = RUN_STATE_TRANSITIONS[current] || [];
    return allowed.includes(next);
  }

  public static canNodeTransition(current: WorkflowRunNodeStatus, next: WorkflowRunNodeStatus): boolean {
    if (current === next) return true;
    const allowed = RUN_NODE_STATE_TRANSITIONS[current] || [];
    return allowed.includes(next);
  }
}
