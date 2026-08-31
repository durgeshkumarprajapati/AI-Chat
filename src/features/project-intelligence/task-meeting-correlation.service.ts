import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { OPEN_INSIGHT_STATUSES, PROJECT_INTELLIGENCE_DETECTION_VERSION } from './project-intelligence.types';
import { withSoftTimeout } from './project-intelligence.util';

export interface TaskMeetingCorrelationResult {
  mismatchesCreated: number;
}

// A meeting older than this with still-PENDING, un-linked task suggestions is flagged as
// "may have been forgotten". Escalated to HIGH severity past the critical threshold below.
const STALE_MEETING_AT_RISK_DAYS = 14;
const STALE_MEETING_CRITICAL_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Reads existing MeetingTaskSuggestion rows to find MISMATCHES between a meeting and the task
 * follow-through it produced. Does NOT generate new task suggestions — that remains
 * clickup-task.service.ts's job — this module only ever creates TASK_MEETING_MISMATCH insights.
 */
export class TaskMeetingCorrelationService {
  public async correlateTasksAndMeetings(userId: string, projectId: string): Promise<TaskMeetingCorrelationResult> {
    await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'VIEW_PROJECT');

    const globalEnabled = await configService.getBoolean('INTELLIGENCE_ENABLED', true);
    if (!globalEnabled) {
      return { mismatchesCreated: 0 };
    }

    const maxCandidates = await configService.getNumber('INTELLIGENCE_MAX_CANDIDATES', 50);
    const timeoutMs = await configService.getNumber('INTELLIGENCE_ANALYSIS_TIMEOUT_MS', 30000);

    return withSoftTimeout(() => this.run(userId, projectId, maxCandidates), timeoutMs, { mismatchesCreated: 0 });
  }

  private async run(userId: string, projectId: string, maxCandidates: number): Promise<TaskMeetingCorrelationResult> {
    const now = new Date();

    const [meetings, existingMismatchInsights] = await Promise.all([
      prisma.meeting.findMany({
        where: { projectId },
        include: { taskSuggestions: true },
        take: maxCandidates,
        orderBy: { meetingDate: 'desc' }
      }),
      prisma.intelligenceInsight.findMany({
        where: { projectId, type: 'TASK_MEETING_MISMATCH', status: { in: [...OPEN_INSIGHT_STATUSES] } },
        select: { metadata: true }
      })
    ]);

    const dedupeKeys = new Set(
      existingMismatchInsights.map((i) => {
        const m = (i.metadata as Record<string, unknown> | null) ?? {};
        return String(m.suggestionId ?? '');
      })
    );

    let mismatchesCreated = 0;

    for (const meeting of meetings) {
      const ageDays = Math.floor((now.getTime() - meeting.meetingDate.getTime()) / DAY_MS);
      if (ageDays < STALE_MEETING_AT_RISK_DAYS) continue;

      const forgottenSuggestions = meeting.taskSuggestions.filter((s) => s.status === 'PENDING' && !s.clickUpTaskId);
      for (const suggestion of forgottenSuggestions) {
        if (dedupeKeys.has(suggestion.id)) continue;
        const severity = ageDays >= STALE_MEETING_CRITICAL_DAYS ? 'HIGH' : 'MEDIUM';
        try {
          await prisma.intelligenceInsight.create({
            data: {
              userId,
              projectId,
              type: 'TASK_MEETING_MISMATCH',
              severity,
              title: `Task suggestion may have been forgotten: ${suggestion.title}`,
              description: `Task suggestion "${suggestion.title}" from meeting "${meeting.title}" (${ageDays} days ago) is still PENDING with no ClickUp link.`,
              confidenceBand: 'MEDIUM',
              confidenceScore: 0.55,
              detectionVersion: PROJECT_INTELLIGENCE_DETECTION_VERSION,
              metadata: { suggestionId: suggestion.id, meetingId: meeting.id, ageDays },
              evidence: {
                create: [
                  {
                    sourceType: 'MEETING_TASK_SUGGESTION',
                    sourceId: suggestion.id,
                    snippet: suggestion.title,
                    sourceTimestamp: meeting.meetingDate
                  }
                ]
              }
            }
          });
          dedupeKeys.add(suggestion.id);
          mismatchesCreated += 1;
        } catch {
          // per-item continue on error
        }
      }
    }

    return { mismatchesCreated };
  }
}

export const taskMeetingCorrelationService = new TaskMeetingCorrelationService();
