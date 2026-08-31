import { IntelligenceSeverity } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { meetingIntelligenceRepository } from '@/features/meeting-intelligence/meeting-intelligence.repository';
import { clickUpClient } from '@/features/meeting-intelligence/clickup/clickup-client';
import { OPEN_INSIGHT_STATUSES, PROJECT_INTELLIGENCE_DETECTION_VERSION } from './project-intelligence.types';
import {
  deriveRiskSeverity,
  findProbableBlockerKeyword,
  isDoneLikeClickUpStatus,
  normalizeForDedupe,
  toStringArray,
  withSoftTimeout
} from './project-intelligence.util';

export interface RiskBlockerDetectionResult {
  risksCreated: number;
  blockersCreated: number;
}

const MIN_TITLE_LENGTH_FOR_DEPENDENCY_MATCH = 6; // avoid trivial substring matches on short titles

/**
 * Creates IntelligenceInsight rows (type PROJECT_RISK / BLOCKER) from real, already-persisted
 * signals. Never writes into MeetingAnalysis.blockers or any other existing table — every
 * finding here is a brand-new IntelligenceInsight + IntelligenceEvidence row.
 */
export class RiskBlockerDetectionService {
  public async detectRisksAndBlockers(userId: string, projectId: string): Promise<RiskBlockerDetectionResult> {
    await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'VIEW_PROJECT');

    const globalEnabled = await configService.getBoolean('INTELLIGENCE_ENABLED', true);
    if (!globalEnabled) {
      // Detection (unlike health computation) simply produces nothing when disabled — a
      // no-op is indistinguishable in effect from "nothing detected this run", which is a safe
      // default for a run-on-demand/periodic-job style method.
      return { risksCreated: 0, blockersCreated: 0 };
    }

    const maxCandidates = await configService.getNumber('INTELLIGENCE_MAX_CANDIDATES', 50);
    const timeoutMs = await configService.getNumber('INTELLIGENCE_ANALYSIS_TIMEOUT_MS', 30000);

    return withSoftTimeout(
      () => this.run(userId, projectId, maxCandidates),
      timeoutMs,
      { risksCreated: 0, blockersCreated: 0 }
    );
  }

  private async run(userId: string, projectId: string, maxCandidates: number): Promise<RiskBlockerDetectionResult> {
    const now = new Date();

    const [meetings, taskSuggestions, existingRiskInsights, existingBlockerInsights] = await Promise.all([
      prisma.meeting.findMany({
        where: { projectId },
        include: { analysis: true },
        take: maxCandidates,
        orderBy: { meetingDate: 'desc' }
      }),
      prisma.meetingTaskSuggestion.findMany({
        where: { meeting: { projectId } },
        include: { link: true },
        take: maxCandidates,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.intelligenceInsight.findMany({
        where: { projectId, type: 'PROJECT_RISK', status: { in: [...OPEN_INSIGHT_STATUSES] } },
        select: { metadata: true }
      }),
      prisma.intelligenceInsight.findMany({
        where: { projectId, type: 'BLOCKER', status: { in: [...OPEN_INSIGHT_STATUSES] } },
        select: { metadata: true }
      })
    ]);

    const riskDedupeKeys = new Set(
      existingRiskInsights.map((i) => {
        const m = (i.metadata as Record<string, unknown> | null) ?? {};
        return `${m.meetingId}::${m.riskTextKey}`;
      })
    );
    const blockerDedupeKeys = new Set(
      existingBlockerInsights.map((i) => {
        const m = (i.metadata as Record<string, unknown> | null) ?? {};
        return `${m.blockerClassification}::${m.sourceId}`;
      })
    );

    let risksCreated = 0;
    let blockersCreated = 0;

    // ---------------------------------------------------------------------------------------
    // Risk detection: existing structured MeetingAnalysis.risks output, one insight per item.
    // ---------------------------------------------------------------------------------------
    for (const meeting of meetings) {
      const risks = toStringArray(meeting.analysis?.risks);
      for (const riskText of risks) {
        const key = `${meeting.id}::${normalizeForDedupe(riskText)}`;
        if (riskDedupeKeys.has(key)) continue;
        try {
          const severity = deriveRiskSeverity(riskText);
          await prisma.intelligenceInsight.create({
            data: {
              userId,
              projectId,
              type: 'PROJECT_RISK',
              severity: severity as IntelligenceSeverity,
              title: `Project risk from meeting: ${meeting.title}`,
              description: riskText,
              // HIGH confidence: this is extracted directly from existing structured
              // MeetingAnalysis output, not a freshly AI-judged claim.
              confidenceBand: 'HIGH',
              confidenceScore: 0.85,
              detectionVersion: PROJECT_INTELLIGENCE_DETECTION_VERSION,
              metadata: { meetingId: meeting.id, riskTextKey: normalizeForDedupe(riskText) },
              evidence: {
                create: [
                  {
                    sourceType: 'MEETING',
                    sourceId: meeting.id,
                    snippet: riskText.slice(0, 500),
                    sourceTimestamp: meeting.meetingDate
                  }
                ]
              }
            }
          });
          riskDedupeKeys.add(key);
          risksCreated += 1;
        } catch {
          // per-item continue on error
        }
      }
    }

    // ---------------------------------------------------------------------------------------
    // Blocker detection — EXPLICIT (overdue due-dates)
    // ---------------------------------------------------------------------------------------
    const openSuggestions = taskSuggestions.filter((t) => t.status !== 'CREATED');

    for (const suggestion of taskSuggestions) {
      if (!suggestion.suggestedDueDate || suggestion.suggestedDueDate >= now || suggestion.status === 'CREATED') continue;
      const key = `EXPLICIT::${suggestion.id}`;
      if (blockerDedupeKeys.has(key)) continue;
      try {
        await prisma.intelligenceInsight.create({
          data: {
            userId,
            projectId,
            type: 'BLOCKER',
            severity: 'HIGH',
            title: `Overdue task suggestion: ${suggestion.title}`,
            description: `Task suggestion "${suggestion.title}" was due ${suggestion.suggestedDueDate.toISOString()} and has not been completed.`,
            confidenceBand: 'HIGH',
            confidenceScore: 0.9,
            detectionVersion: PROJECT_INTELLIGENCE_DETECTION_VERSION,
            metadata: { blockerClassification: 'EXPLICIT', sourceId: suggestion.id, source: 'MEETING_TASK_SUGGESTION' },
            evidence: {
              create: [
                {
                  sourceType: 'MEETING_TASK_SUGGESTION',
                  sourceId: suggestion.id,
                  snippet: suggestion.title,
                  sourceTimestamp: suggestion.suggestedDueDate
                }
              ]
            }
          }
        });
        blockerDedupeKeys.add(key);
        blockersCreated += 1;
      } catch {
        // continue
      }
    }

    // EXPLICIT — overdue real ClickUp tasks, but only via the legitimate project-scoped path:
    // a ClickUpTaskLink created from one of this project's own meeting task suggestions.
    const linkedListIds = Array.from(
      new Set(taskSuggestions.map((t) => t.link?.clickUpListId).filter((id): id is string => Boolean(id)))
    );
    if (linkedListIds.length > 0) {
      try {
        const integration = await meetingIntelligenceRepository.getClickUpIntegration(userId);
        if (integration) {
          for (const listId of linkedListIds.slice(0, maxCandidates)) {
            const tasks = await clickUpClient.getTasksForList(integration.accessToken, listId);
            for (const task of tasks) {
              if (task.dueDate == null || task.dueDate >= now.getTime() || isDoneLikeClickUpStatus(task.status)) continue;
              const key = `EXPLICIT::${task.id}`;
              if (blockerDedupeKeys.has(key)) continue;
              try {
                await prisma.intelligenceInsight.create({
                  data: {
                    userId,
                    projectId,
                    type: 'BLOCKER',
                    severity: 'HIGH',
                    title: `Overdue ClickUp task: ${task.name}`,
                    description: `ClickUp task "${task.name}" is overdue (due ${new Date(task.dueDate).toISOString()}) and status is "${task.status}".`,
                    confidenceBand: 'HIGH',
                    confidenceScore: 0.9,
                    detectionVersion: PROJECT_INTELLIGENCE_DETECTION_VERSION,
                    metadata: { blockerClassification: 'EXPLICIT', sourceId: task.id, source: 'CLICKUP_TASK', listId },
                    evidence: {
                      create: [
                        {
                          sourceType: 'CLICKUP_TASK',
                          sourceId: task.id,
                          snippet: task.name,
                          sourceTimestamp: new Date(task.dueDate)
                        }
                      ]
                    }
                  }
                });
                blockerDedupeKeys.add(key);
                blockersCreated += 1;
              } catch {
                // continue
              }
            }
          }
        }
      } catch {
        // ClickUp is best-effort here too
      }
    }

    // ---------------------------------------------------------------------------------------
    // Blocker detection — PROBABLE (keyword scan of discussion/openQuestions)
    // ---------------------------------------------------------------------------------------
    for (const meeting of meetings) {
      const textItems = [
        ...toStringArray(meeting.analysis?.discussion),
        ...toStringArray(meeting.analysis?.openQuestions)
      ];
      for (const text of textItems) {
        const matchedKeyword = findProbableBlockerKeyword(text);
        if (!matchedKeyword) continue;
        const sourceId = `${meeting.id}:${normalizeForDedupe(text)}`;
        const key = `PROBABLE::${sourceId}`;
        if (blockerDedupeKeys.has(key)) continue;
        try {
          await prisma.intelligenceInsight.create({
            data: {
              userId,
              projectId,
              type: 'BLOCKER',
              severity: 'MEDIUM',
              title: `Possible blocker mentioned in meeting: ${meeting.title}`,
              description: text.slice(0, 500),
              // MEDIUM confidence: keyword heuristic over free text, not a hard date fact.
              confidenceBand: 'MEDIUM',
              confidenceScore: 0.55,
              detectionVersion: PROJECT_INTELLIGENCE_DETECTION_VERSION,
              metadata: { blockerClassification: 'PROBABLE', sourceId, matchedKeyword, meetingId: meeting.id },
              evidence: {
                create: [
                  {
                    sourceType: 'MEETING',
                    sourceId: meeting.id,
                    snippet: text.slice(0, 500),
                    sourceTimestamp: meeting.meetingDate
                  }
                ]
              }
            }
          });
          blockerDedupeKeys.add(key);
          blockersCreated += 1;
        } catch {
          // continue
        }
      }
    }

    // ---------------------------------------------------------------------------------------
    // Blocker detection — DEPENDENCY_RISK (bounded textual cross-reference between two still-
    // open task suggestions' titles within the same project — not a full NLP dependency graph).
    // ---------------------------------------------------------------------------------------
    for (const a of openSuggestions) {
      for (const b of openSuggestions) {
        if (a.id === b.id) continue;
        if (b.title.length < MIN_TITLE_LENGTH_FOR_DEPENDENCY_MATCH) continue;
        const aText = `${a.title} ${a.description ?? ''}`.toLowerCase();
        if (!aText.includes(b.title.toLowerCase())) continue;
        const key = `DEPENDENCY_RISK::${a.id}`;
        if (blockerDedupeKeys.has(key)) continue;
        try {
          await prisma.intelligenceInsight.create({
            data: {
              userId,
              projectId,
              type: 'BLOCKER',
              severity: 'MEDIUM',
              title: `Task suggestion may depend on another open task: ${a.title}`,
              description: `Task suggestion "${a.title}" textually references still-open task suggestion "${b.title}".`,
              confidenceBand: 'LOW',
              confidenceScore: 0.4,
              detectionVersion: PROJECT_INTELLIGENCE_DETECTION_VERSION,
              metadata: { blockerClassification: 'DEPENDENCY_RISK', sourceId: a.id, dependsOnSuggestionId: b.id },
              evidence: {
                create: [
                  { sourceType: 'MEETING_TASK_SUGGESTION', sourceId: a.id, snippet: a.title },
                  { sourceType: 'MEETING_TASK_SUGGESTION', sourceId: b.id, snippet: b.title }
                ]
              }
            }
          });
          blockerDedupeKeys.add(key);
          blockersCreated += 1;
        } catch {
          // continue
        }
        break; // one dependency finding per suggestion A is enough signal
      }
    }

    return { risksCreated, blockersCreated };
  }
}

export const riskBlockerDetectionService = new RiskBlockerDetectionService();
