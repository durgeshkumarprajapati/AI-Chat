import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { AggregatedSignals, SignalRef } from '../types/ai-intelligence.types';
import { toStringArray } from './aggregation.util';

// Existing Phase 78 IntelligenceInsight types this aggregation reads (never re-derives).
const KNOWLEDGE_INSIGHT_TYPES = ['STALE_KNOWLEDGE', 'CONTRADICTION'] as const;
const RISK_TYPE = 'PROJECT_RISK' as const;
const BLOCKER_TYPE = 'BLOCKER' as const;
const DEADLINE_TYPE = 'DEADLINE_RISK' as const;
const MISMATCH_TYPE = 'TASK_MEETING_MISMATCH' as const;
const OPEN_INSIGHT_STATUSES = ['NEW', 'UNDER_REVIEW', 'CONFIRMED'] as const;

// Never a platform-wide scan: when scope is user-wide (projectId null), project health is
// bounded to this many of the user's own OWNED projects (documented known scaling limit).
const MAX_HEALTH_PROJECTS = 20;

/**
 * Reads bounded, already-persisted signals across tasks/meetings/documents and Phase 78
 * IntelligenceInsight/ProjectHealthSnapshot rows into one AggregatedSignals shape. Never re-runs
 * contradiction/freshness/risk/blocker/deadline/task-meeting-mismatch detection itself — those
 * detectors already ran (elsewhere) and persisted their findings; this service only reads them.
 */
export class IntelligenceAggregationService {
  public async collect(
    userId: string,
    projectId: string | null,
    periodStart: Date,
    periodEnd: Date
  ): Promise<AggregatedSignals> {
    const [maxTasks, maxMeetings, maxDocuments, maxInsights] = await Promise.all([
      configService.getNumber('AI_INTELLIGENCE_MAX_TASKS', 50),
      configService.getNumber('AI_INTELLIGENCE_MAX_MEETINGS', 20),
      configService.getNumber('AI_INTELLIGENCE_MAX_DOCUMENTS', 30),
      configService.getNumber('AI_INTELLIGENCE_MAX_INSIGHTS', 50)
    ]);

    const now = new Date();

    // Every query below is independent of the others' results, so they run in parallel via one
    // Promise.all rather than sequentially — this is the dominant cost of a generation pass.
    const [overdueTaskRows, dueSoonTaskRows, meetingRows, documentRows, insightRows, healthRows] = await Promise.all([
      prisma.meetingTaskSuggestion.findMany({
        where: {
          userId,
          meeting: projectId ? { projectId } : undefined,
          suggestedDueDate: { lt: now },
          status: { not: 'CREATED' }
        },
        select: { id: true, title: true, suggestedDueDate: true, meetingId: true },
        orderBy: { suggestedDueDate: 'asc' },
        take: maxTasks
      }),
      prisma.meetingTaskSuggestion.findMany({
        where: {
          userId,
          meeting: projectId ? { projectId } : undefined,
          suggestedDueDate: { gte: now, lte: periodEnd },
          status: { not: 'CREATED' }
        },
        select: { id: true, title: true, suggestedDueDate: true, meetingId: true },
        orderBy: { suggestedDueDate: 'asc' },
        take: maxTasks
      }),
      prisma.meeting.findMany({
        where: {
          userId,
          ...(projectId ? { projectId } : {}),
          meetingDate: { gte: periodStart, lte: periodEnd }
        },
        select: {
          id: true,
          title: true,
          meetingDate: true,
          analysis: { select: { decisions: true, actionItems: true } }
        },
        orderBy: { meetingDate: 'desc' },
        take: maxMeetings
      }),
      projectId
        ? prisma.projectDocument.findMany({
            where: {
              projectId,
              document: { updatedAt: { gte: periodStart, lte: periodEnd }, isDeleted: false }
            },
            select: {
              document: { select: { id: true, filename: true, originalFilename: true, updatedAt: true } }
            },
            take: maxDocuments
          })
        : prisma.document.findMany({
            where: { userId, updatedAt: { gte: periodStart, lte: periodEnd }, isDeleted: false },
            select: { id: true, filename: true, originalFilename: true, updatedAt: true },
            orderBy: { updatedAt: 'desc' },
            take: maxDocuments
          }),
      prisma.intelligenceInsight.findMany({
        where: {
          userId,
          projectId: projectId ?? undefined,
          type: { in: [...KNOWLEDGE_INSIGHT_TYPES, RISK_TYPE, BLOCKER_TYPE, DEADLINE_TYPE, MISMATCH_TYPE] },
          status: { in: [...OPEN_INSIGHT_STATUSES] },
          createdAt: { gte: periodStart }
        },
        select: { id: true, type: true, title: true, description: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: maxInsights
      }),
      this.collectProjectHealth(userId, projectId)
    ]);

    const overdueTasks: SignalRef[] = overdueTaskRows.map((t) => ({
      id: t.id,
      title: t.title,
      sourceType: 'TASK',
      sourceId: t.id,
      timestamp: (t.suggestedDueDate as Date).toISOString(),
      meta: { meetingId: t.meetingId }
    }));

    const dueSoonTasks: SignalRef[] = dueSoonTaskRows.map((t) => ({
      id: t.id,
      title: t.title,
      sourceType: 'TASK',
      sourceId: t.id,
      timestamp: (t.suggestedDueDate as Date).toISOString(),
      meta: { meetingId: t.meetingId }
    }));

    const recentMeetings: SignalRef[] = meetingRows.map((m) => ({
      id: m.id,
      title: m.title,
      sourceType: 'MEETING',
      sourceId: m.id,
      timestamp: m.meetingDate.toISOString()
    }));

    // Decisions/action items are extracted from a bounded set of meetings (maxMeetings) — cap the
    // resulting flattened lists at maxInsights so one meeting with an unusually long Json array
    // cannot blow past the aggregation's overall size budget.
    const decisions: SignalRef[] = [];
    const actionItems: SignalRef[] = [];
    for (const m of meetingRows) {
      for (const text of toStringArray(m.analysis?.decisions)) {
        if (decisions.length >= maxInsights) break;
        decisions.push({
          id: `${m.id}:decision:${decisions.length}`,
          title: text.slice(0, 300),
          sourceType: 'MEETING',
          sourceId: m.id,
          timestamp: m.meetingDate.toISOString()
        });
      }
      for (const text of toStringArray(m.analysis?.actionItems)) {
        if (actionItems.length >= maxTasks) break;
        actionItems.push({
          id: `${m.id}:actionItem:${actionItems.length}`,
          title: text.slice(0, 300),
          sourceType: 'MEETING',
          sourceId: m.id,
          timestamp: m.meetingDate.toISOString()
        });
      }
    }

    const recentDocumentChanges: SignalRef[] = projectId
      ? (documentRows as Array<{ document: { id: string; filename: string; originalFilename: string; updatedAt: Date } }>).map(
          (pd) => ({
            id: pd.document.id,
            title: pd.document.originalFilename || pd.document.filename,
            sourceType: 'DOCUMENT',
            sourceId: pd.document.id,
            timestamp: pd.document.updatedAt.toISOString()
          })
        )
      : (documentRows as Array<{ id: string; filename: string; originalFilename: string; updatedAt: Date }>).map((d) => ({
          id: d.id,
          title: d.originalFilename || d.filename,
          sourceType: 'DOCUMENT',
          sourceId: d.id,
          timestamp: d.updatedAt.toISOString()
        }));

    const knowledgeChanges: SignalRef[] = [];
    const risks: SignalRef[] = [];
    const blockers: SignalRef[] = [];
    const deadlineRisks: SignalRef[] = [];
    const taskMeetingMismatches: SignalRef[] = [];

    for (const insight of insightRows) {
      const ref: SignalRef = {
        id: insight.id,
        title: insight.title,
        sourceType: 'INTELLIGENCE_INSIGHT',
        sourceId: insight.id,
        timestamp: insight.createdAt.toISOString(),
        meta: { description: insight.description }
      };
      if ((KNOWLEDGE_INSIGHT_TYPES as readonly string[]).includes(insight.type)) knowledgeChanges.push(ref);
      else if (insight.type === RISK_TYPE) risks.push(ref);
      else if (insight.type === BLOCKER_TYPE) blockers.push(ref);
      else if (insight.type === DEADLINE_TYPE) deadlineRisks.push(ref);
      else if (insight.type === MISMATCH_TYPE) taskMeetingMismatches.push(ref);
    }

    const truncated =
      overdueTaskRows.length === maxTasks ||
      dueSoonTaskRows.length === maxTasks ||
      meetingRows.length === maxMeetings ||
      documentRows.length === maxDocuments ||
      insightRows.length === maxInsights;

    return {
      userId,
      projectId,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      overdueTasks,
      dueSoonTasks,
      recentMeetings,
      decisions,
      actionItems,
      recentDocumentChanges,
      knowledgeChanges,
      risks,
      blockers,
      deadlineRisks,
      taskMeetingMismatches,
      projectHealthSummaries: healthRows,
      truncated
    };
  }

  /**
   * Project-scoped: the single latest ProjectHealthSnapshot for that project.
   * User-wide (projectId null): bounded to this user's own OWNED projects (never a platform-wide
   * scan), one snapshot per project via `distinct` — a documented, deliberate scaling limit
   * (MAX_HEALTH_PROJECTS) rather than an unbounded per-project fetch loop.
   */
  private async collectProjectHealth(
    userId: string,
    projectId: string | null
  ): Promise<Array<{ projectId: string; overallStatus: string; createdAt: string }>> {
    if (projectId) {
      const snap = await prisma.projectHealthSnapshot.findFirst({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        select: { projectId: true, overallStatus: true, createdAt: true }
      });
      return snap ? [{ projectId: snap.projectId, overallStatus: snap.overallStatus, createdAt: snap.createdAt.toISOString() }] : [];
    }

    const ownedProjects = await prisma.project.findMany({
      where: { ownerId: userId },
      select: { id: true },
      take: MAX_HEALTH_PROJECTS
    });
    if (ownedProjects.length === 0) return [];

    const snapshots = await prisma.projectHealthSnapshot.findMany({
      where: { projectId: { in: ownedProjects.map((p) => p.id) } },
      orderBy: [{ projectId: 'asc' }, { createdAt: 'desc' }],
      distinct: ['projectId'],
      select: { projectId: true, overallStatus: true, createdAt: true }
    });
    return snapshots.map((s) => ({ projectId: s.projectId, overallStatus: s.overallStatus, createdAt: s.createdAt.toISOString() }));
  }
}

export const intelligenceAggregationService = new IntelligenceAggregationService();
