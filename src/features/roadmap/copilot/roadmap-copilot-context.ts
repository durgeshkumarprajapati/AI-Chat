import { RoadmapInsights, RoadmapInsightsOverview } from '../execution/roadmap-insights';
import { ExecutionHealth } from '../execution/roadmap-execution-health';
import { NextStepResult } from '../execution/roadmap-next-step';
import { CopilotAction } from './roadmap-copilot.types';

export interface CopilotPhaseSummary {
  phaseId: string;
  title: string;
  progressPercentage: number;
  totalTasks: number;
  blockedTasks: number;
  overdueTasks: number;
}

export interface CopilotBottleneckSummary {
  type: string;
  severity: string;
  affectedTaskCount: number;
  explanation: string;
  recommendedAction: string;
}

export interface CopilotDependencyImpactSummary {
  title: string;
  transitiveDependentCount: number;
  blocksNextStep: boolean;
  chainContainsOverdueTask: boolean;
}

export interface CopilotFocusTask {
  id: string;
  title: string;
  status: string;
  isExecutable: boolean;
  isOverdue: boolean;
  dueDateStatus: string;
  blockedByTitles: string[];
  downstreamImpact?: CopilotDependencyImpactSummary;
  /** Only populated when the requesting action's own subject IS the task's content
   * (REFINE_TASK/SUGGEST_SUBTASKS) — never included by default, and never for every task at
   * once, satisfying "do not automatically dump every task description into the AI prompt." */
  description?: string;
}

/**
 * Structured, minimal, already-authorized roadmap context for the AI Roadmap Copilot — pure and
 * DB-free. Never includes anything the caller (the copilot route) hasn't already loaded via the
 * SAME authorized `findRoadmapByIdForUser` + `computeRoadmapInsights` calls every other roadmap
 * route uses. Workload is deliberately reduced to anonymous aggregate counts — no assignee
 * name/id/email ever enters the LLM prompt (Security requirement: "no hidden user information in
 * workload context").
 */
export interface CopilotRoadmapContext {
  roadmapTitle: string;
  overview: RoadmapInsightsOverview;
  currentProgress: number;
  executionHealth: ExecutionHealth;
  phases: CopilotPhaseSummary[];
  nextStep: NextStepResult;
  bottlenecks: CopilotBottleneckSummary[];
  workloadSummary: {
    totalAssignees: number;
    highWorkloadCount: number;
    overdueWorkloadCount: number;
    blockedWorkloadCount: number;
  };
  dependencyImpact: CopilotDependencyImpactSummary[];
  trendStatus: 'OK' | 'INSUFFICIENT_DATA';
  focusTask?: CopilotFocusTask;
  focusPhase?: CopilotPhaseSummary;
  /** Future retrieval-context plug point (RAG Integration, deliberately out of scope this phase —
   * see the final report's "RAG integration decision"). Always undefined today: RAG is never
   * automatically invoked. A future pass can populate this from an authorized, project-scoped
   * retrieval call without changing anything else in this module or the copilot service. */
  retrievalContext?: { source: string; snippet: string }[];
}

export interface BuildCopilotContextParams {
  roadmapTitle: string;
  insights: RoadmapInsights;
  /** Raw, already-loaded roadmap phases — used ONLY to resolve a single focus task's own
   * description when genuinely relevant (never for any other task). */
  rawPhases: { tasks: { id: string; description: string }[] }[];
  taskId?: string;
  phaseId?: string;
  includeTaskDescription?: boolean;
}

export function buildCopilotContext(params: BuildCopilotContextParams): CopilotRoadmapContext {
  const { roadmapTitle, insights, rawPhases, taskId, phaseId, includeTaskDescription } = params;

  const taskTitleById = new Map(insights.tasks.map((t) => [t.id, t.title]));
  const taskDescriptionById = new Map(rawPhases.flatMap((p) => p.tasks).map((t) => [t.id, t.description]));
  const dependencyImpactByTaskId = new Map(insights.dependencyImpact.map((d) => [d.taskId, d]));

  const phases: CopilotPhaseSummary[] = insights.phaseAnalytics.map((p) => ({
    phaseId: p.phaseId,
    title: p.phaseTitle,
    progressPercentage: p.progressPercentage,
    totalTasks: p.totalTasks,
    blockedTasks: p.blockedTasks,
    overdueTasks: p.overdueTasks
  }));

  const bottlenecks: CopilotBottleneckSummary[] = insights.bottlenecks.map((b) => ({
    type: b.type,
    severity: b.severity,
    affectedTaskCount: b.affectedTaskCount,
    explanation: b.explanation,
    recommendedAction: b.recommendedAction
  }));

  const workloadSummary = {
    totalAssignees: insights.workload.assignees.length,
    highWorkloadCount: insights.workload.flags.filter((f) => f.type === 'HIGH_WORKLOAD').length,
    overdueWorkloadCount: insights.workload.flags.filter((f) => f.type === 'OVERDUE_WORKLOAD').length,
    blockedWorkloadCount: insights.workload.flags.filter((f) => f.type === 'BLOCKED_WORKLOAD').length
  };

  const dependencyImpact: CopilotDependencyImpactSummary[] = insights.dependencyImpact.slice(0, 10).map((d) => ({
    title: d.title,
    transitiveDependentCount: d.transitiveDependentCount,
    blocksNextStep: d.blocksNextStep,
    chainContainsOverdueTask: d.chainContainsOverdueTask
  }));

  let focusTask: CopilotFocusTask | undefined;
  if (taskId) {
    const t = insights.tasks.find((x) => x.id === taskId);
    if (t) {
      const impact = dependencyImpactByTaskId.get(taskId);
      focusTask = {
        id: t.id,
        title: t.title,
        status: t.status,
        isExecutable: t.isExecutable,
        isOverdue: t.isOverdue,
        dueDateStatus: t.dueDateStatus,
        blockedByTitles: t.blockedByTaskIds.map((id) => taskTitleById.get(id) ?? 'Unknown task'),
        downstreamImpact: impact
          ? { title: impact.title, transitiveDependentCount: impact.transitiveDependentCount, blocksNextStep: impact.blocksNextStep, chainContainsOverdueTask: impact.chainContainsOverdueTask }
          : undefined,
        description: includeTaskDescription ? taskDescriptionById.get(t.id) : undefined
      };
    }
  }

  const focusPhase = phaseId ? phases.find((p) => p.phaseId === phaseId) : undefined;

  return {
    roadmapTitle,
    overview: insights.overview,
    currentProgress: insights.overview.currentProgress,
    executionHealth: insights.executionHealth,
    phases,
    nextStep: insights.nextStep,
    bottlenecks,
    workloadSummary,
    dependencyImpact,
    trendStatus: insights.trends.taskCompletion.status,
    focusTask,
    focusPhase
  };
}

/**
 * Deterministic, ground-truth facts for a given action — sourced ENTIRELY from already-computed
 * context, never touched by the LLM. Always populated even if the subsequent AI call fails, so a
 * degraded response still shows the user real facts. Independently unit-testable, zero I/O.
 */
export function buildDeterministicFacts(action: CopilotAction, context: CopilotRoadmapContext): string[] {
  const facts: string[] = [];

  switch (action) {
    case 'EXPLAIN_HEALTH':
      facts.push(`Execution health: ${context.executionHealth.status}.`);
      facts.push(`${context.overview.completedTasks} of ${context.overview.totalTasks} tasks completed (${context.currentProgress}%).`);
      if (context.overview.blockedTasks > 0) facts.push(`${context.overview.blockedTasks} task(s) are currently blocked by incomplete dependencies.`);
      if (context.overview.overdueTasks > 0) facts.push(`${context.overview.overdueTasks} task(s) are overdue.`);
      if (context.bottlenecks.length > 0) facts.push(`${context.bottlenecks.length} bottleneck(s) detected: ${context.bottlenecks.map((b) => b.type).join(', ')}.`);
      break;

    case 'EXPLAIN_BOTTLENECKS':
      if (context.bottlenecks.length === 0) {
        facts.push('No bottlenecks detected.');
      } else {
        for (const b of context.bottlenecks) facts.push(`${b.type} (${b.severity}): ${b.explanation}`);
      }
      break;

    case 'RECOMMEND_ACTIONS':
      if (context.nextStep === null) {
        facts.push('Every task in this roadmap is complete.');
      } else if ('executable' in context.nextStep && context.nextStep.executable === false) {
        facts.push(`Execution is currently blocked — "${context.nextStep.taskTitle}" is blocked by ${context.nextStep.blockedBy.length} dependency task(s).`);
      } else {
        facts.push(`Recommended next task: "${context.nextStep.taskTitle}" in phase "${context.nextStep.phaseTitle}" (${context.nextStep.reason}).`);
      }
      break;

    case 'EXPLAIN_DEPENDENCY':
      if (context.focusTask) {
        facts.push(`Task "${context.focusTask.title}" status: ${context.focusTask.status}.`);
        if (context.focusTask.downstreamImpact) {
          facts.push(`${context.focusTask.downstreamImpact.transitiveDependentCount} downstream task(s) depend on this task (directly or transitively).`);
          if (context.focusTask.downstreamImpact.blocksNextStep) facts.push('This task is currently blocking the recommended next step.');
          if (context.focusTask.downstreamImpact.chainContainsOverdueTask) facts.push('At least one downstream dependent task is overdue.');
        } else {
          facts.push('No other tasks currently depend on this task.');
        }
      } else {
        facts.push('No task was specified or the task could not be found in this roadmap.');
      }
      break;

    case 'SUMMARIZE_PROGRESS':
    case 'SHARE_PROGRESS_SUMMARY':
      facts.push(`Progress: ${context.currentProgress}% (${context.overview.completedTasks}/${context.overview.totalTasks} tasks).`);
      facts.push(`Execution health: ${context.executionHealth.status}.`);
      if (context.overview.blockedTasks > 0) facts.push(`${context.overview.blockedTasks} task(s) blocked.`);
      if (context.overview.overdueTasks > 0) facts.push(`${context.overview.overdueTasks} task(s) overdue.`);
      if (context.trendStatus === 'INSUFFICIENT_DATA') facts.push('Not enough completion history yet to show a trend.');
      break;

    case 'REFINE_TASK':
    case 'SUGGEST_SUBTASKS':
      if (context.focusTask) {
        facts.push(`Task "${context.focusTask.title}" status: ${context.focusTask.status}.`);
      } else {
        facts.push('No task was specified or the task could not be found in this roadmap.');
      }
      break;

    case 'SUGGEST_DEPENDENCIES':
      facts.push(`Roadmap has ${context.phases.length} phase(s) and ${context.overview.totalTasks} task(s).`);
      break;
  }

  return facts;
}
