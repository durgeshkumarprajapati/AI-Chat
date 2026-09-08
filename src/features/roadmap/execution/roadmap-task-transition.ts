export type RoadmapTaskStatusValue = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';

export interface TaskTimestamps {
  status: RoadmapTaskStatusValue;
  startedAt: Date | null;
  completedAt: Date | null;
}

/**
 * Pure, deterministic task-status transition — zero I/O, fully unit-testable. Reuses the
 * EXISTING RoadmapTask.status string values ('PENDING' | 'IN_PROGRESS' | 'COMPLETED' — the
 * schema was never renamed to a NOT_STARTED-labelled enum, since that would be a breaking change
 * to every existing row; 'PENDING' is treated as the "Not Started" concept everywhere else).
 *
 * The UI's "Start" and "Reopen" actions are both just a request for target status
 * 'IN_PROGRESS' — only the button LABEL differs based on the task's current status (see
 * roadmaps/[id]/page.tsx). This function is what makes both idempotent and timestamp-correct:
 *  - Entering IN_PROGRESS for the first time sets startedAt; resuming/reopening preserves the
 *    ORIGINAL startedAt rather than overwriting it.
 *  - Completing a task sets completedAt — but repeating an already-COMPLETED request is a true
 *    no-op (returns the identical timestamps), so re-clicking "Mark Completed" never drifts
 *    completedAt forward.
 *  - Reopening (COMPLETED -> IN_PROGRESS) clears completedAt but keeps startedAt.
 *  - An explicit reset to PENDING clears both timestamps.
 */
export function computeTaskTransition(
  current: TaskTimestamps,
  requestedStatus: RoadmapTaskStatusValue,
  now: Date = new Date()
): TaskTimestamps {
  if (requestedStatus === 'COMPLETED') {
    if (current.status === 'COMPLETED') {
      return current; // idempotent — never drifts completedAt on a repeated request
    }
    return { status: 'COMPLETED', startedAt: current.startedAt ?? now, completedAt: now };
  }

  if (requestedStatus === 'IN_PROGRESS') {
    return { status: 'IN_PROGRESS', startedAt: current.startedAt ?? now, completedAt: null };
  }

  // requestedStatus === 'PENDING' — explicit reset.
  return { status: 'PENDING', startedAt: null, completedAt: null };
}
