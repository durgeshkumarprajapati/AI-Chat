import { prisma } from '../lib/prisma.js';
import { configService } from '@/features/config';
import { projectIntelligenceOrchestrator } from '@/features/project-intelligence/project-intelligence.orchestrator';

/**
 * Periodic Phase 78B analysis pass — bounded to the most recently active projects per tick
 * (never a full-table scan) so this can run safely on any cadence without competing for DB
 * capacity with request-path traffic. Runs as the project's owner (full VIEW_PROJECT access by
 * construction), mirroring billing-reconciliation.processor.ts's "processor queries candidates
 * directly, then hands off to the domain orchestrator" pattern. A failure analyzing one project
 * never blocks the rest, and this entire processor failing never affects any existing worker job.
 */
const MAX_PROJECTS_PER_TICK = 25;

export class ProjectIntelligenceAnalysisProcessor {
  public async run(): Promise<{ analyzed: number; failed: number }> {
    const enabled = await configService.getBoolean('INTELLIGENCE_ENABLED', true);
    const healthEnabled = await configService.getBoolean('INTELLIGENCE_PROJECT_HEALTH_ENABLED', true);
    if (!enabled || !healthEnabled) {
      return { analyzed: 0, failed: 0 };
    }

    const projects = await prisma.project.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { updatedAt: 'desc' },
      take: MAX_PROJECTS_PER_TICK,
      select: { id: true, ownerId: true }
    });

    let analyzed = 0;
    let failed = 0;

    for (const project of projects) {
      try {
        await projectIntelligenceOrchestrator.runAnalysisForProject(project.ownerId, project.id);
        analyzed++;
      } catch (err) {
        failed++;
        console.error(`[ProjectIntelligenceAnalysis] Failed for project ${project.id}:`, err instanceof Error ? err.message : err);
      }
    }

    return { analyzed, failed };
  }
}

export const projectIntelligenceAnalysisProcessor = new ProjectIntelligenceAnalysisProcessor();
