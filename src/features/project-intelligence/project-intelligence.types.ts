// Phase 78B — Project Intelligence shared types.
//
// Everything here is additive and lives only under src/features/project-intelligence/.
// No LLM-derived "score" appears anywhere in this file on purpose: health is a small,
// deterministic, explainable state machine over real signals (task/meeting/document
// counts and dates), never a black-box number.

/**
 * Three-level health status scheme, applied identically to every health dimension
 * (schedule/task/risk/blocker/documentation/meeting) AND to the overall status:
 *  - HEALTHY:  no material concerning signal for this dimension.
 *  - AT_RISK:  at least one concerning signal, not yet severe.
 *  - CRITICAL: multiple and/or severe concerning signals — needs attention now.
 * Overall status is simply the worst of the six dimension statuses (CRITICAL > AT_RISK > HEALTHY).
 */
export type HealthStatus = 'HEALTHY' | 'AT_RISK' | 'CRITICAL';

/**
 * Blocker classification used by risk-blocker-detection.service.ts:
 *  - EXPLICIT:         a real overdue due-date (ClickUp task or MeetingTaskSuggestion) — the
 *                       strongest signal, derived from a hard date comparison, not language.
 *  - PROBABLE:         a fixed keyword heuristic over meeting discussion/open-questions text
 *                       ("waiting on", "blocked by", ...) — a heuristic, not a claim of understanding.
 *  - DEPENDENCY_RISK:   a bounded textual cross-reference between two still-open task
 *                       suggestions within the same project (substring match on titles).
 */
export type BlockerClassification = 'EXPLICIT' | 'PROBABLE' | 'DEPENDENCY_RISK';

export interface ScheduleHealthFactors {
  totalTaskSuggestions: number;
  overdueTaskSuggestions: number;
  overdueRatio: number;
}

export interface ClickUpTaskHealthFactors {
  /** true only when the ClickUp list was discovered via a real ClickUpTaskLink created from
   *  one of this project's meetings — i.e. genuinely project-scoped, not user-scoped-only. */
  scoped: boolean;
  totalTasks: number;
  overdueTasks: number;
  overdueRatio: number;
}

export interface TaskHealthFactors {
  totalTaskSuggestions: number;
  openTaskSuggestions: number;
  openRatio: number;
  clickUp?: ClickUpTaskHealthFactors;
}

export interface RiskHealthFactors {
  meetingsScanned: number;
  meetingsWithRisks: number;
  totalRiskItems: number;
  /** risk items belonging to a meeting held within the recency lookback window */
  recentRiskItems: number;
  recencyLookbackDays: number;
}

export interface BlockerHealthFactors {
  openBlockerInsights: number;
  explicitCount: number;
  probableCount: number;
  dependencyRiskCount: number;
}

export interface DocumentationHealthFactors {
  linkedDocuments: number;
  linkedKnowledgeBases: number;
  staleDocuments: number;
  staleThresholdDays: number;
}

export interface MeetingHealthFactors {
  totalMeetings: number;
  daysSinceLastMeeting: number | null;
  cadenceThresholdDays: number;
}

/** Persisted verbatim into ProjectHealthSnapshot.factors — must let a human reconstruct WHY
 *  each dimension got its status without re-running anything. */
export interface HealthFactors {
  schedule: ScheduleHealthFactors;
  task: TaskHealthFactors;
  risk: RiskHealthFactors;
  blocker: BlockerHealthFactors;
  documentation: DocumentationHealthFactors;
  meeting: MeetingHealthFactors;
}

export const PROJECT_HEALTH_MODEL_VERSION = 'v1';
export const PROJECT_INTELLIGENCE_DETECTION_VERSION = 'v1';

/** Insight statuses considered "still open" for dedupe purposes across every 78B detector. */
export const OPEN_INSIGHT_STATUSES = ['NEW', 'UNDER_REVIEW'] as const;
