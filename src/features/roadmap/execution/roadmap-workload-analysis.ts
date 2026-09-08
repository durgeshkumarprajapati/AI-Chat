export type WorkloadFlagType = 'HIGH_WORKLOAD' | 'OVERDUE_WORKLOAD' | 'BLOCKED_WORKLOAD';
export type WorkloadSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface WorkloadFlag {
  type: WorkloadFlagType;
  severity: WorkloadSeverity;
  assigneeId: string;
  explanation: string;
}

export interface AssigneeWorkload {
  assigneeId: string;
  assignedTaskCount: number;
  inProgressCount: number;
  overdueCount: number;
  blockedCount: number;
  completedCount: number;
}

export interface WorkloadAnalysis {
  assignees: AssigneeWorkload[];
  flags: WorkloadFlag[];
}

export interface WorkloadTask {
  assigneeId: string | null;
  status: string;
  isOverdue: boolean;
  isExecutable: boolean;
}

const HIGH_WORKLOAD_MIN_INCOMPLETE = 3;
const HIGH_WORKLOAD_RATIO_OF_AVERAGE = 2; // flagged once an assignee's incomplete load is >= 2x the roadmap average
const HIGH_WORKLOAD_CRITICAL_RATIO_OF_AVERAGE = 3;
const OVERDUE_WORKLOAD_CRITICAL_COUNT = 3;

/**
 * Roadmap workload distribution only — never an employee-performance score. Only assignees who
 * actually have at least one assigned task appear at all: a user with zero tasks is simply absent
 * from `assignees`/`flags`, never surfaced as "0 tasks" or any other inactivity signal.
 */
export function analyzeWorkload(tasks: WorkloadTask[]): WorkloadAnalysis {
  const byAssignee = new Map<string, AssigneeWorkload>();

  for (const task of tasks) {
    if (!task.assigneeId) continue;
    if (!byAssignee.has(task.assigneeId)) {
      byAssignee.set(task.assigneeId, {
        assigneeId: task.assigneeId,
        assignedTaskCount: 0,
        inProgressCount: 0,
        overdueCount: 0,
        blockedCount: 0,
        completedCount: 0
      });
    }
    const workload = byAssignee.get(task.assigneeId)!;
    workload.assignedTaskCount++;
    if (task.status === 'COMPLETED') {
      workload.completedCount++;
      continue; // a completed task is never overdue/blocked for workload purposes
    }
    if (task.status === 'IN_PROGRESS') workload.inProgressCount++;
    if (task.isOverdue) workload.overdueCount++;
    if (!task.isExecutable) workload.blockedCount++;
  }

  const assignees = Array.from(byAssignee.values());
  const incompleteCounts = assignees.map((a) => a.assignedTaskCount - a.completedCount);
  const averageIncomplete = incompleteCounts.length > 0 ? incompleteCounts.reduce((a, b) => a + b, 0) / incompleteCounts.length : 0;

  const flags: WorkloadFlag[] = [];
  for (const assignee of assignees) {
    const incomplete = assignee.assignedTaskCount - assignee.completedCount;

    // HIGH_WORKLOAD — deterministic RELATIVE comparison against this roadmap's own average
    // incomplete load, never an absolute/arbitrary "performance" threshold.
    const warningThreshold = Math.max(HIGH_WORKLOAD_MIN_INCOMPLETE, averageIncomplete * HIGH_WORKLOAD_RATIO_OF_AVERAGE);
    if (incomplete >= warningThreshold) {
      const criticalThreshold = Math.max(HIGH_WORKLOAD_MIN_INCOMPLETE + 2, averageIncomplete * HIGH_WORKLOAD_CRITICAL_RATIO_OF_AVERAGE);
      flags.push({
        type: 'HIGH_WORKLOAD',
        severity: incomplete >= criticalThreshold ? 'CRITICAL' : 'WARNING',
        assigneeId: assignee.assigneeId,
        explanation: `${incomplete} incomplete task(s) assigned, compared to an average of ${averageIncomplete.toFixed(1)} across ${assignees.length} assignee(s).`
      });
    }

    if (assignee.overdueCount > 0) {
      flags.push({
        type: 'OVERDUE_WORKLOAD',
        severity: assignee.overdueCount >= OVERDUE_WORKLOAD_CRITICAL_COUNT ? 'CRITICAL' : 'WARNING',
        assigneeId: assignee.assigneeId,
        explanation: `${assignee.overdueCount} overdue task(s) assigned.`
      });
    }

    if (assignee.blockedCount > 0) {
      flags.push({
        type: 'BLOCKED_WORKLOAD',
        severity: 'INFO',
        assigneeId: assignee.assigneeId,
        explanation: `${assignee.blockedCount} assigned task(s) are currently blocked by dependencies.`
      });
    }
  }

  return { assignees, flags };
}
