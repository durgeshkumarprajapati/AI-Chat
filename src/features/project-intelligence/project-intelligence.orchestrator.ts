import { ProjectHealthSnapshot } from '@prisma/client';
import { entitlementService } from '@/features/billing/entitlement.service';
import { auditService } from '@/features/audit/audit.service';
import { projectHealthService } from './project-health.service';
import { riskBlockerDetectionService } from './risk-blocker-detection.service';
import { deadlineIntelligenceService } from './deadline-intelligence.service';
import { taskMeetingCorrelationService } from './task-meeting-correlation.service';

export interface ProjectIntelligenceRunResult {
  health: ProjectHealthSnapshot;
  risksCreated: number;
  blockersCreated: number;
  deadlineRisksCreated: number;
  mismatchesCreated: number;
}

/**
 * Single entry point for a full Project Intelligence pass — this is what a future worker job or
 * on-demand API route calls. Each sub-analysis is independent and run via Promise.allSettled so
 * one detector's failure never blocks the others. The one exception is project health: since
 * ProjectHealthSnapshot is a required (non-null) field on the return type, a failure computing
 * it (most commonly an authorization failure — every sub-service independently re-checks
 * authorizeProjectAccess, so a denied user fails identically and fails BEFORE any of them touch
 * prisma) is re-thrown rather than swallowed.
 */
export class ProjectIntelligenceOrchestrator {
  public async runAnalysisForProject(userId: string, projectId: string): Promise<ProjectIntelligenceRunResult> {
    await entitlementService.requireFeature(userId, 'PROJECT_INTELLIGENCE');

    const [healthResult, riskBlockerResult, deadlineResult, correlationResult] = await Promise.allSettled([
      projectHealthService.computeProjectHealth(userId, projectId),
      riskBlockerDetectionService.detectRisksAndBlockers(userId, projectId),
      deadlineIntelligenceService.analyzeDeadlines(userId, projectId),
      taskMeetingCorrelationService.correlateTasksAndMeetings(userId, projectId)
    ]);

    if (healthResult.status === 'rejected') {
      throw healthResult.reason;
    }

    const logFailure = async (name: string, result: PromiseSettledResult<unknown>) => {
      if (result.status !== 'rejected') return;
      await auditService.logEvent({
        actorId: userId,
        action: 'PROJECT_INTELLIGENCE_DETECTOR_FAILED',
        targetType: 'PROJECT',
        targetId: projectId,
        projectId,
        details: { detector: name, error: result.reason?.message ?? String(result.reason) }
      });
    };
    await Promise.all([
      logFailure('riskBlockerDetection', riskBlockerResult),
      logFailure('deadlineIntelligence', deadlineResult),
      logFailure('taskMeetingCorrelation', correlationResult)
    ]);

    return {
      health: healthResult.value,
      risksCreated: riskBlockerResult.status === 'fulfilled' ? riskBlockerResult.value.risksCreated : 0,
      blockersCreated: riskBlockerResult.status === 'fulfilled' ? riskBlockerResult.value.blockersCreated : 0,
      deadlineRisksCreated: deadlineResult.status === 'fulfilled' ? deadlineResult.value.deadlineRisksCreated : 0,
      mismatchesCreated: correlationResult.status === 'fulfilled' ? correlationResult.value.mismatchesCreated : 0
    };
  }
}

export const projectIntelligenceOrchestrator = new ProjectIntelligenceOrchestrator();
