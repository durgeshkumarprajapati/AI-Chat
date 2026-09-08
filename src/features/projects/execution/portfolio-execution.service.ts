import { projectService } from '@/features/projects/project.service';
import { projectExecutionService } from './project-execution.service';
import { loadPortfolioExecutionConfig } from './project-execution-config';
import { buildPortfolioExecutionSummary, PortfolioProjectEntry } from './portfolio-execution-aggregation';
import { PortfolioExecutionSummary } from './portfolio-execution.types';

/**
 * Portfolio Intelligence — a thin composition layer over the EXISTING per-project execution
 * summary; it performs zero roadmap/task computation of its own. `projectService.getUserProjects`
 * is already authorization-scoped at the query layer (owned-or-member only), and
 * `projectExecutionService.getProjectExecutionSummary` independently re-authorizes VIEW_PROJECT
 * per project — so a project the requesting user cannot access can never appear here, checked
 * twice over. Bounded to `PROJECT_EXECUTION_MAX_PORTFOLIO_PROJECTS` to avoid unbounded fan-out for
 * a user who belongs to many projects.
 */
export class PortfolioExecutionService {
  public async getPortfolioExecutionSummary(userId: string): Promise<PortfolioExecutionSummary> {
    const config = await loadPortfolioExecutionConfig();
    const projects = await projectService.getUserProjects(userId);
    const bounded = projects.slice(0, config.maxProjects);

    const entries: PortfolioProjectEntry[] = await Promise.all(
      bounded.map(async (project) => ({
        projectId: project.id,
        projectName: project.name,
        execution: await projectExecutionService.getProjectExecutionSummary(userId, project.id)
      }))
    );

    return buildPortfolioExecutionSummary(entries);
  }
}

export const portfolioExecutionService = new PortfolioExecutionService();
