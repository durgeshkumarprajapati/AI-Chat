import { ProjectExecutionStatus } from './project-execution.types';

export interface PortfolioProjectSummary {
  projectId: string;
  name: string;
  status: ProjectExecutionStatus;
  roadmapCount: number;
  progress: { completed: number; total: number; percentage: number };
}

export interface PortfolioPriority {
  projectId: string;
  projectName: string;
  roadmapId?: string;
  taskId?: string;
  /** Reused verbatim from that project's own selectProjectPriority reason — never re-derived or
   * fabricated at the portfolio level. */
  reason: string;
}

export interface PortfolioExecutionSummary {
  projects: PortfolioProjectSummary[];
  summary: { total: number; healthy: number; atRisk: number; critical: number };
  priorities: PortfolioPriority[];
  attention: { blocked: number; overdue: number };
}
