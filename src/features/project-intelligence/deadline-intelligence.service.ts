import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { googleCalendarService } from '@/features/calendar/google-calendar.service';
import { OPEN_INSIGHT_STATUSES, PROJECT_INTELLIGENCE_DETECTION_VERSION } from './project-intelligence.types';
import { withSoftTimeout } from './project-intelligence.util';

export interface DeadlineIntelligenceResult {
  deadlineRisksCreated: number;
}

// Convergence window: due dates within this many days of each other are considered "converging".
const CONVERGENCE_WINDOW_DAYS = 7;
// A calendar event within this many days of a due date counts as a "follow-up" for it.
const CALENDAR_FOLLOWUP_WINDOW_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

function sameDay(a: Date, b: Date): boolean {
  return Math.abs(a.getTime() - b.getTime()) < CONVERGENCE_WINDOW_DAYS * DAY_MS;
}

/**
 * Advisory-only, read-only correlation across ClickUp due dates / meeting-suggested due dates /
 * Calendar events. Never creates, updates, or deletes a real ClickUp task or Calendar event —
 * writes ONLY new IntelligenceInsight (+ IntelligenceEvidence) rows.
 */
export class DeadlineIntelligenceService {
  public async analyzeDeadlines(userId: string, projectId: string): Promise<DeadlineIntelligenceResult> {
    await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'VIEW_PROJECT');

    const globalEnabled = await configService.getBoolean('INTELLIGENCE_ENABLED', true);
    if (!globalEnabled) {
      return { deadlineRisksCreated: 0 };
    }

    const maxCandidates = await configService.getNumber('INTELLIGENCE_MAX_CANDIDATES', 50);
    const timeoutMs = await configService.getNumber('INTELLIGENCE_ANALYSIS_TIMEOUT_MS', 30000);

    return withSoftTimeout(() => this.run(userId, projectId, maxCandidates), timeoutMs, { deadlineRisksCreated: 0 });
  }

  private async run(userId: string, projectId: string, maxCandidates: number): Promise<DeadlineIntelligenceResult> {
    const now = new Date();

    const [suggestionsWithDueDates, openBlockerCount, existingDeadlineInsights] = await Promise.all([
      prisma.meetingTaskSuggestion.findMany({
        where: { meeting: { projectId }, suggestedDueDate: { not: null }, status: { not: 'CREATED' } },
        take: maxCandidates,
        orderBy: { suggestedDueDate: 'asc' }
      }),
      prisma.intelligenceInsight.count({
        where: { projectId, type: 'BLOCKER', status: { in: [...OPEN_INSIGHT_STATUSES] } }
      }),
      prisma.intelligenceInsight.findMany({
        where: { projectId, type: 'DEADLINE_RISK', status: { in: [...OPEN_INSIGHT_STATUSES] } },
        select: { metadata: true }
      })
    ]);

    const dedupeKeys = new Set(
      existingDeadlineInsights.map((i) => {
        const m = (i.metadata as Record<string, unknown> | null) ?? {};
        return String(m.dedupeKey ?? '');
      })
    );

    let deadlineRisksCreated = 0;

    // ---------------------------------------------------------------------------------------
    // Trigger 1: convergence — multiple due dates clustering together while the project already
    // has open blockers (a real signal that the team may not be able to absorb the load).
    // ---------------------------------------------------------------------------------------
    if (openBlockerCount > 0) {
      const withDates = suggestionsWithDueDates.filter((s) => s.suggestedDueDate) as Array<typeof suggestionsWithDueDates[number] & { suggestedDueDate: Date }>;
      const used = new Set<string>();
      for (let i = 0; i < withDates.length; i++) {
        const current = withDates[i];
        if (!current || used.has(current.id)) continue;
        const cluster = [current];
        for (let j = i + 1; j < withDates.length; j++) {
          const candidate = withDates[j];
          if (!candidate || used.has(candidate.id)) continue;
          if (sameDay(current.suggestedDueDate, candidate.suggestedDueDate)) {
            cluster.push(candidate);
          }
        }
        if (cluster.length >= 2) {
          cluster.forEach((s) => used.add(s.id));
          const dedupeKey = `CONVERGENCE::${cluster.map((s) => s.id).sort().join(',')}`;
          if (dedupeKeys.has(dedupeKey)) continue;
          try {
            await prisma.intelligenceInsight.create({
              data: {
                userId,
                projectId,
                type: 'DEADLINE_RISK',
                severity: 'HIGH',
                title: `${cluster.length} deadlines converging with open blockers present`,
                description: `${cluster.length} task suggestions have due dates within ${CONVERGENCE_WINDOW_DAYS} days of each other (${cluster
                  .map((s) => s.title)
                  .join(', ')}), and the project currently has ${openBlockerCount} open blocker(s).`,
                confidenceBand: 'MEDIUM',
                confidenceScore: 0.6,
                detectionVersion: PROJECT_INTELLIGENCE_DETECTION_VERSION,
                metadata: { dedupeKey, kind: 'CONVERGENCE', suggestionIds: cluster.map((s) => s.id), openBlockerCount },
                evidence: {
                  create: cluster.map((s) => ({
                    sourceType: 'MEETING_TASK_SUGGESTION',
                    sourceId: s.id,
                    snippet: s.title,
                    sourceTimestamp: s.suggestedDueDate
                  }))
                }
              }
            });
            deadlineRisksCreated += 1;
          } catch {
            // continue
          }
        }
      }
    }

    // ---------------------------------------------------------------------------------------
    // Trigger 2: overdue item with no corresponding calendar follow-up.
    // ---------------------------------------------------------------------------------------
    const overdue = suggestionsWithDueDates.filter((s) => s.suggestedDueDate && s.suggestedDueDate < now);
    if (overdue.length > 0) {
      const dates = overdue.map((s) => s.suggestedDueDate as Date);
      const minDate = new Date(Math.min(...dates.map((d) => d.getTime())) - CALENDAR_FOLLOWUP_WINDOW_DAYS * DAY_MS);
      const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())) + CALENDAR_FOLLOWUP_WINDOW_DAYS * DAY_MS);

      let events: { startTime: string }[] = [];
      try {
        const result = await googleCalendarService.getUpcomingEvents(userId, minDate.toISOString(), maxDate.toISOString(), maxCandidates);
        if (result.success) events = result.events;
      } catch {
        // Calendar is best-effort for this advisory signal; skip trigger 2 if unavailable.
      }

      for (const suggestion of overdue) {
        const dueDate = suggestion.suggestedDueDate as Date;
        const hasFollowup = events.some((e) => Math.abs(new Date(e.startTime).getTime() - dueDate.getTime()) <= CALENDAR_FOLLOWUP_WINDOW_DAYS * DAY_MS);
        if (hasFollowup) continue;
        const dedupeKey = `NO_FOLLOWUP::${suggestion.id}`;
        if (dedupeKeys.has(dedupeKey)) continue;
        try {
          await prisma.intelligenceInsight.create({
            data: {
              userId,
              projectId,
              type: 'DEADLINE_RISK',
              severity: 'MEDIUM',
              title: `Overdue deadline with no calendar follow-up: ${suggestion.title}`,
              description: `Task suggestion "${suggestion.title}" was due ${dueDate.toISOString()} and no calendar event was found within ${CALENDAR_FOLLOWUP_WINDOW_DAYS} days of that date.`,
              confidenceBand: 'MEDIUM',
              confidenceScore: 0.5,
              detectionVersion: PROJECT_INTELLIGENCE_DETECTION_VERSION,
              metadata: { dedupeKey, kind: 'NO_FOLLOWUP', suggestionId: suggestion.id },
              evidence: {
                create: [
                  { sourceType: 'MEETING_TASK_SUGGESTION', sourceId: suggestion.id, snippet: suggestion.title, sourceTimestamp: dueDate }
                ]
              }
            }
          });
          deadlineRisksCreated += 1;
        } catch {
          // continue
        }
      }
    }

    return { deadlineRisksCreated };
  }
}

export const deadlineIntelligenceService = new DeadlineIntelligenceService();
