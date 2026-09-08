import { ExecutionHealthStatus } from '@/features/roadmap/execution/roadmap-execution-health';
import { NextStepResult } from '@/features/roadmap/execution/roadmap-next-step';

/**
 * Project Execution Command Center — a project-level severity vocabulary distinct from (but
 * derived from) the roadmap-level ExecutionHealthStatus ('HEALTHY'|'AT_RISK'|'BLOCKED'|'OVERDUE').
 * Chosen to match the vocabulary the existing ProjectHealthSnapshot/project-health.service.ts
 * already uses ('HEALTHY'|'AT_RISK'|'CRITICAL'), so a project page can present roadmap-execution
 * status alongside the existing project-health dimensions without introducing a THIRD vocabulary.
 * See mapExecutionHealthToProjectStatus for the exact, documented mapping rule.
 */
export type ProjectExecutionStatus = 'HEALTHY' | 'AT_RISK' | 'CRITICAL';

export interface ProjectRoadmapExecutionSummary {
  roadmapId: string;
  title: string;
  /** Project-level mapped status — see mapExecutionHealthToProjectStatus. */
  status: ProjectExecutionStatus;
  /** The raw, unmapped roadmap execution status, kept for transparency/debugging. */
  executionHealth: ExecutionHealthStatus;
  progress: { completed: number; total: number; percentage: number };
  blockedTasks: number;
  overdueTasks: number;
  dueSoonTasks: number;
  unassignedTasks: number;
  nextStep: NextStepResult;
}

export interface ProjectExecutionPriority {
  roadmapId: string;
  roadmapTitle: string;
  taskId?: string;
  taskTitle?: string;
  /** Always a human-readable, non-fabricated explanation derived from real, already-computed
   * roadmap execution data (never an LLM-generated string). */
  reason: string;
}

export interface ProjectAttentionCategory {
  totalTasks: number;
  /** Roadmap ids affected by this category — never task descriptions/notes. */
  roadmapIds: string[];
}

export interface ProjectMostImpactfulBlockedTask {
  roadmapId: string;
  roadmapTitle: string;
  taskId: string;
  title: string;
  transitiveDependentCount: number;
}

export interface ProjectAttentionBreakdown {
  blocked: ProjectAttentionCategory & { mostImpactfulTask?: ProjectMostImpactfulBlockedTask };
  overdue: ProjectAttentionCategory;
  dueSoon: ProjectAttentionCategory;
  unassigned: ProjectAttentionCategory;
}

export type ProjectExecutionTimeline =
  | { status: 'INSUFFICIENT_DATA' }
  | { status: 'OK'; completions: { last7Days: number; last30Days: number } };

export interface ProjectExecutionSummary {
  status: ProjectExecutionStatus;
  roadmapCount: number;
  progress: { completed: number; total: number; percentage: number };
  attention: ProjectAttentionBreakdown;
  roadmaps: ProjectRoadmapExecutionSummary[];
  topPriority?: ProjectExecutionPriority;
  timeline: ProjectExecutionTimeline;
  /** Count of roadmaps linked to the project (via ProjectRoadmap) that the requesting user could
   * NOT access (no active RoadmapShare, share expired/revoked, or not the owner) and were
   * therefore silently excluded from every field above — never surfaced as an error, and never
   * exposed beyond this count (no roadmap id/title leaks for an unauthorized roadmap). */
  inaccessibleRoadmapCount: number;
}
