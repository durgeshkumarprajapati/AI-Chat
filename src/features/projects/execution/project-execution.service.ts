import { prisma } from '@/lib/prisma';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { roadmapRepository } from '@/features/roadmap/repository/roadmap.repository';
import { computeRoadmapInsights } from '@/features/roadmap/execution/roadmap-insights';
import { loadRoadmapReminderConfig } from '@/features/roadmap/execution/roadmap-reminder-config';
import { loadRoadmapBottleneckConfig } from '@/features/roadmap/execution/roadmap-bottleneck-config';
import { loadProjectExecutionConfig } from './project-execution-config';
import { buildProjectExecutionSummary, ProjectRoadmapInsightsEntry } from './project-execution-aggregation';
import { ProjectExecutionSummary } from './project-execution.types';

/**
 * Project Execution Command Center orchestrator — composes ONLY existing, already-authorized
 * roadmap execution primitives into a project-level read model. Never a second task/health engine:
 * every number in the returned summary traces back to computeRoadmapInsights, the same pure
 * function every existing roadmap insights/copilot route already calls.
 *
 * Authorization model (Section 14): project access and roadmap access are, today, two entirely
 * separate authorization domains in this codebase — being a ProjectMember never grants roadmap
 * access (confirmed: no code path consults ProjectMember when resolving roadmap permission; a
 * roadmap's permission is derived ONLY from ownership or an active, non-expired RoadmapShare row).
 * This service does NOT change that. It authorizes the PROJECT first (VIEW_PROJECT), then, for
 * each linked roadmap, re-authorizes the ROADMAP independently via the exact same
 * findRoadmapByIdForUser gate every other roadmap route uses. A linked roadmap the requesting user
 * cannot access is silently excluded — never an error, never a leaked title/id, only reflected in
 * `inaccessibleRoadmapCount`. This directly satisfies: a project member without roadmap access
 * sees nothing about that roadmap; a roadmap share expiring removes it from future summaries with
 * no other project-level side effect; project access being revoked fails at the first
 * authorizeProjectAccess call, before any roadmap is touched.
 *
 * Performance (Section 16): exactly one project authorization call, one bounded
 * `ProjectRoadmap` query (capped at `PROJECT_EXECUTION_MAX_ROADMAPS`), and — for the resulting
 * bounded set of linked roadmaps — a parallel (Promise.all) fan-out of the SAME two queries the
 * single-roadmap insights route already performs (findRoadmapByIdForUser +
 * listDependencyEdgesForRoadmap). No per-task queries, no LLM calls, no RAG retrieval, no
 * polling. reminderConfig/bottleneckConfig are loaded once and shared across every roadmap in the
 * fan-out, not reloaded per roadmap.
 */
export class ProjectExecutionService {
  public async getProjectExecutionSummary(userId: string, projectId: string): Promise<ProjectExecutionSummary> {
    await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'VIEW_PROJECT');

    const executionConfig = await loadProjectExecutionConfig();

    const links = await prisma.projectRoadmap.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      take: executionConfig.maxRoadmaps,
      select: { roadmapId: true }
    });

    if (links.length === 0) {
      return buildProjectExecutionSummary([], 0);
    }

    const [reminderConfig, bottleneckConfig] = await Promise.all([loadRoadmapReminderConfig(), loadRoadmapBottleneckConfig()]);

    const results = await Promise.all(
      links.map((link) => roadmapRepository.findRoadmapByIdForUser(link.roadmapId, userId))
    );

    const accessible = results.filter((r): r is NonNullable<typeof r> => r !== null);
    const inaccessibleRoadmapCount = results.length - accessible.length;

    const entries: ProjectRoadmapInsightsEntry[] = await Promise.all(
      accessible.map(async (result) => {
        const edges = await roadmapRepository.listDependencyEdgesForRoadmap(result.roadmap.id);
        const insights = computeRoadmapInsights(result.roadmap.phases, edges, reminderConfig, bottleneckConfig);
        const completedAtValues = result.roadmap.phases.flatMap((p) => p.tasks.map((t) => t.completedAt));
        return { roadmapId: result.roadmap.id, title: result.roadmap.title, insights, completedAtValues };
      })
    );

    return buildProjectExecutionSummary(entries, inaccessibleRoadmapCount);
  }
}

export const projectExecutionService = new ProjectExecutionService();
