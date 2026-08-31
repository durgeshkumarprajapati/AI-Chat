import { ProjectHealthSnapshot } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { ValidationError } from '@/errors';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { meetingIntelligenceRepository } from '@/features/meeting-intelligence/meeting-intelligence.repository';
import { clickUpClient } from '@/features/meeting-intelligence/clickup/clickup-client';
import {
  HealthFactors,
  HealthStatus,
  PROJECT_HEALTH_MODEL_VERSION,
  OPEN_INSIGHT_STATUSES
} from './project-intelligence.types';
import { isDoneLikeClickUpStatus, toStringArray } from './project-intelligence.util';

// ---------------------------------------------------------------------------------------------
// Fixed, documented thresholds. Deliberately a handful of well-commented constants rather than
// a config key per threshold — see Phase 78B brief: over-engineering config for this scope.
// ---------------------------------------------------------------------------------------------
const SCHEDULE_AT_RISK_RATIO = 0; // any overdue task suggestion at all -> at least AT_RISK
const SCHEDULE_CRITICAL_RATIO = 0.3; // >30% overdue -> CRITICAL

const TASK_AT_RISK_OPEN_RATIO = 0.5; // >50% of task suggestions still open -> AT_RISK
const TASK_CRITICAL_OPEN_RATIO = 0.8; // >80% still open -> CRITICAL
const CLICKUP_AT_RISK_OVERDUE_RATIO = 0.3;
const CLICKUP_CRITICAL_OVERDUE_RATIO = 0.5;

const RISK_AT_RISK_RECENT_ITEMS = 1; // 1-2 recent risk items -> AT_RISK
const RISK_CRITICAL_RECENT_ITEMS = 3; // >=3 recent risk items -> CRITICAL
const RISK_RECENCY_LOOKBACK_DAYS = 30;

const BLOCKER_AT_RISK_COUNT = 1; // any open blocker -> AT_RISK
const BLOCKER_CRITICAL_COUNT = 4; // >=4 open blockers -> CRITICAL
const BLOCKER_CRITICAL_EXPLICIT_COUNT = 2; // >=2 EXPLICIT blockers alone -> CRITICAL

const DOC_STALE_THRESHOLD_DAYS = 90; // a linked document untouched for 90+ days counts as stale
const DOC_AT_RISK_STALE_RATIO = 0; // any stale linked document -> AT_RISK
const DOC_CRITICAL_STALE_RATIO = 0.5; // >50% of linked documents stale -> CRITICAL

const MEETING_CADENCE_AT_RISK_DAYS = 30; // no meeting in 30 days -> AT_RISK
const MEETING_CADENCE_CRITICAL_DAYS = 60; // no meeting in 60 days -> CRITICAL

const DAY_MS = 24 * 60 * 60 * 1000;

function worstOf(...statuses: HealthStatus[]): HealthStatus {
  if (statuses.includes('CRITICAL')) return 'CRITICAL';
  if (statuses.includes('AT_RISK')) return 'AT_RISK';
  return 'HEALTHY';
}

function ratioStatus(ratio: number, atRiskAt: number, criticalAt: number): HealthStatus {
  if (ratio > criticalAt) return 'CRITICAL';
  if (ratio > atRiskAt) return 'AT_RISK';
  return 'HEALTHY';
}

/**
 * Deterministic, versioned, explainable project health computation. No LLM call anywhere in
 * this file's scoring math — every dimension is a threshold over a real, persisted count or
 * date. `factors` on the resulting snapshot always contains the exact numbers used, so any
 * status can be reconstructed/audited by a human without re-running anything.
 */
export class ProjectHealthService {
  private async assertEnabled(): Promise<void> {
    const [globalEnabled, projectHealthEnabled] = await Promise.all([
      configService.getBoolean('INTELLIGENCE_ENABLED', true),
      configService.getBoolean('INTELLIGENCE_PROJECT_HEALTH_ENABLED', true)
    ]);
    if (!globalEnabled || !projectHealthEnabled) {
      // Design decision: computeProjectHealth throws (rather than returning null) when disabled,
      // so a caller can never mistake "feature off" for "genuinely healthy project" — a null/OK
      // return would be silently indistinguishable from a real HEALTHY snapshot. getLatestHealth/
      // getHealthHistory are pure reads of already-persisted history and are NOT gated by this
      // flag — disabling computation should not hide previously computed history.
      throw new ValidationError('Project health computation is disabled by configuration (INTELLIGENCE_ENABLED / INTELLIGENCE_PROJECT_HEALTH_ENABLED).');
    }
  }

  public async computeProjectHealth(userId: string, projectId: string): Promise<ProjectHealthSnapshot> {
    await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'VIEW_PROJECT');
    await this.assertEnabled();

    const maxCandidates = await configService.getNumber('INTELLIGENCE_MAX_CANDIDATES', 50);
    const now = new Date();

    const [taskSuggestions, meetings, openBlockerInsights, projectDocuments, projectKnowledgeBases, lastMeeting] =
      await Promise.all([
        prisma.meetingTaskSuggestion.findMany({
          where: { meeting: { projectId } },
          include: { link: true },
          take: maxCandidates,
          orderBy: { createdAt: 'desc' }
        }),
        prisma.meeting.findMany({
          where: { projectId },
          include: { analysis: true },
          take: maxCandidates,
          orderBy: { meetingDate: 'desc' }
        }),
        prisma.intelligenceInsight.findMany({
          where: { projectId, type: 'BLOCKER', status: { in: [...OPEN_INSIGHT_STATUSES] } },
          select: { metadata: true }
        }),
        prisma.projectDocument.findMany({
          where: { projectId },
          include: { document: { select: { updatedAt: true } } }
        }),
        prisma.projectKnowledgeBase.count({ where: { projectId } }),
        prisma.meeting.findFirst({ where: { projectId }, orderBy: { meetingDate: 'desc' }, select: { meetingDate: true } })
      ]);

    // --- schedule dimension ---------------------------------------------------------------
    const totalTaskSuggestions = taskSuggestions.length;
    const overdueTaskSuggestions = taskSuggestions.filter(
      (t) => t.suggestedDueDate && t.suggestedDueDate < now && t.status !== 'CREATED'
    ).length;
    const scheduleOverdueRatio = totalTaskSuggestions > 0 ? overdueTaskSuggestions / totalTaskSuggestions : 0;
    const scheduleHealth: HealthStatus =
      totalTaskSuggestions === 0
        ? 'HEALTHY'
        : ratioStatus(scheduleOverdueRatio, SCHEDULE_AT_RISK_RATIO, SCHEDULE_CRITICAL_RATIO);

    // --- task dimension --------------------------------------------------------------------
    const openTaskSuggestions = taskSuggestions.filter((t) => t.status !== 'CREATED').length;
    const openRatio = totalTaskSuggestions > 0 ? openTaskSuggestions / totalTaskSuggestions : 0;
    let taskHealth: HealthStatus =
      totalTaskSuggestions === 0 ? 'HEALTHY' : ratioStatus(openRatio, TASK_AT_RISK_OPEN_RATIO, TASK_CRITICAL_OPEN_RATIO);

    // Legitimate project-scoped ClickUp signal: a suggestion from this project's own meetings
    // that was later linked to a real ClickUp task/list (ClickUpTaskLink), never a blind
    // user-wide workspace scan.
    const linkedListIds = Array.from(
      new Set(taskSuggestions.map((t) => t.link?.clickUpListId).filter((id): id is string => Boolean(id)))
    );

    let clickUpFactors: HealthFactors['task']['clickUp'];
    if (linkedListIds.length > 0) {
      try {
        const integration = await meetingIntelligenceRepository.getClickUpIntegration(userId);
        if (integration) {
          const listsTasks = await Promise.all(
            linkedListIds.slice(0, maxCandidates).map((listId) => clickUpClient.getTasksForList(integration.accessToken, listId))
          );
          const allTasks = listsTasks.flat();
          const overdueTasks = allTasks.filter((t) => t.dueDate != null && t.dueDate < now.getTime() && !isDoneLikeClickUpStatus(t.status)).length;
          const overdueRatio = allTasks.length > 0 ? overdueTasks / allTasks.length : 0;
          clickUpFactors = { scoped: true, totalTasks: allTasks.length, overdueTasks, overdueRatio };
          if (allTasks.length > 0) {
            taskHealth = worstOf(taskHealth, ratioStatus(overdueRatio, CLICKUP_AT_RISK_OVERDUE_RATIO, CLICKUP_CRITICAL_OVERDUE_RATIO));
          }
        }
      } catch {
        // ClickUp is best-effort for health scoring; a transient failure should not fail the
        // whole snapshot — just omit the clickUp sub-factor.
      }
    }

    // --- risk dimension ----------------------------------------------------------------------
    const recencyThreshold = new Date(now.getTime() - RISK_RECENCY_LOOKBACK_DAYS * DAY_MS);
    let totalRiskItems = 0;
    let recentRiskItems = 0;
    let meetingsWithRisks = 0;
    for (const meeting of meetings) {
      const risks = toStringArray(meeting.analysis?.risks);
      if (risks.length === 0) continue;
      meetingsWithRisks += 1;
      totalRiskItems += risks.length;
      if (meeting.meetingDate >= recencyThreshold) {
        recentRiskItems += risks.length;
      }
    }
    const riskHealth: HealthStatus = ratioStatus(recentRiskItems, RISK_AT_RISK_RECENT_ITEMS - 1, RISK_CRITICAL_RECENT_ITEMS - 1);

    // --- blocker dimension ---------------------------------------------------------------------
    let explicitCount = 0;
    let probableCount = 0;
    let dependencyRiskCount = 0;
    for (const insight of openBlockerInsights) {
      const classification = (insight.metadata as Record<string, unknown> | null)?.blockerClassification;
      if (classification === 'EXPLICIT') explicitCount += 1;
      else if (classification === 'PROBABLE') probableCount += 1;
      else if (classification === 'DEPENDENCY_RISK') dependencyRiskCount += 1;
    }
    const openBlockerCount = openBlockerInsights.length;
    let blockerHealth: HealthStatus = ratioStatus(openBlockerCount, BLOCKER_AT_RISK_COUNT - 1, BLOCKER_CRITICAL_COUNT - 1);
    if (explicitCount >= BLOCKER_CRITICAL_EXPLICIT_COUNT) blockerHealth = 'CRITICAL';

    // --- documentation dimension -----------------------------------------------------------
    const staleThreshold = new Date(now.getTime() - DOC_STALE_THRESHOLD_DAYS * DAY_MS);
    const staleDocuments = projectDocuments.filter((pd) => pd.document.updatedAt < staleThreshold).length;
    const linkedDocuments = projectDocuments.length;
    const staleRatio = linkedDocuments > 0 ? staleDocuments / linkedDocuments : 0;
    const documentationHealth: HealthStatus =
      linkedDocuments === 0 && projectKnowledgeBases === 0
        ? 'AT_RISK' // no documentation linked to the project at all is itself a signal
        : ratioStatus(staleRatio, DOC_AT_RISK_STALE_RATIO, DOC_CRITICAL_STALE_RATIO);

    // --- meeting dimension -------------------------------------------------------------------
    const daysSinceLastMeeting = lastMeeting ? Math.floor((now.getTime() - lastMeeting.meetingDate.getTime()) / DAY_MS) : null;
    const meetingHealth: HealthStatus =
      daysSinceLastMeeting === null
        ? 'AT_RISK'
        : daysSinceLastMeeting > MEETING_CADENCE_CRITICAL_DAYS
          ? 'CRITICAL'
          : daysSinceLastMeeting > MEETING_CADENCE_AT_RISK_DAYS
            ? 'AT_RISK'
            : 'HEALTHY';

    const overallStatus = worstOf(scheduleHealth, taskHealth, riskHealth, blockerHealth, documentationHealth, meetingHealth);

    const factors: HealthFactors = {
      schedule: { totalTaskSuggestions, overdueTaskSuggestions, overdueRatio: scheduleOverdueRatio },
      task: { totalTaskSuggestions, openTaskSuggestions, openRatio, clickUp: clickUpFactors },
      risk: {
        meetingsScanned: meetings.length,
        meetingsWithRisks,
        totalRiskItems,
        recentRiskItems,
        recencyLookbackDays: RISK_RECENCY_LOOKBACK_DAYS
      },
      blocker: { openBlockerInsights: openBlockerCount, explicitCount, probableCount, dependencyRiskCount },
      documentation: {
        linkedDocuments,
        linkedKnowledgeBases: projectKnowledgeBases,
        staleDocuments,
        staleThresholdDays: DOC_STALE_THRESHOLD_DAYS
      },
      meeting: { totalMeetings: meetings.length, daysSinceLastMeeting, cadenceThresholdDays: MEETING_CADENCE_AT_RISK_DAYS }
    };

    return prisma.projectHealthSnapshot.create({
      data: {
        projectId,
        overallStatus,
        scheduleHealth,
        taskHealth,
        riskHealth,
        blockerHealth,
        documentationHealth,
        meetingHealth,
        modelVersion: PROJECT_HEALTH_MODEL_VERSION,
        factors: factors as any
      }
    });
  }

  public async getLatestHealth(userId: string, projectId: string): Promise<ProjectHealthSnapshot | null> {
    await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'VIEW_PROJECT');
    return prisma.projectHealthSnapshot.findFirst({
      where: { projectId },
      orderBy: { createdAt: 'desc' }
    });
  }

  public async getHealthHistory(userId: string, projectId: string, limit = 20): Promise<ProjectHealthSnapshot[]> {
    await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'VIEW_PROJECT');
    return prisma.projectHealthSnapshot.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(1, limit), 100)
    });
  }
}

export const projectHealthService = new ProjectHealthService();
