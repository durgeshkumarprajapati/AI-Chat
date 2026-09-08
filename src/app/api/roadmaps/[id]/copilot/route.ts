import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { roadmapRepository } from '@/features/roadmap/repository/roadmap.repository';
import { computeRoadmapInsights } from '@/features/roadmap/execution/roadmap-insights';
import { loadRoadmapReminderConfig } from '@/features/roadmap/execution/roadmap-reminder-config';
import { loadRoadmapBottleneckConfig } from '@/features/roadmap/execution/roadmap-bottleneck-config';
import { buildCopilotContext } from '@/features/roadmap/copilot/roadmap-copilot-context';
import { buildRetrievalQuery } from '@/features/roadmap/copilot/roadmap-copilot-retrieval-query';
import { roadmapCopilotRetrievalService } from '@/features/roadmap/copilot/roadmap-copilot-retrieval.service';
import { loadRoadmapCopilotRagConfig } from '@/features/roadmap/copilot/roadmap-copilot-rag-config';
import { roadmapCopilotService } from '@/features/roadmap/copilot/roadmap-copilot.service';
import { COPILOT_ACTIONS, COPILOT_PROPOSAL_ACTIONS, COPILOT_RETRIEVAL_ELIGIBLE_ACTIONS, CopilotAction } from '@/features/roadmap/copilot/roadmap-copilot.types';
import { AppError, ValidationError, NotFoundError } from '@/errors';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { id: string };
}

/**
 * AI Roadmap Copilot — reuses every existing primitive rather than duplicating any of it:
 * findRoadmapByIdForUser for authorization (identical gate to every other roadmap route),
 * listDependencyEdgesForRoadmap + computeRoadmapInsights (the SAME insights orchestrator, called
 * exactly once) for deterministic facts, and buildCopilotContext to produce the minimal,
 * already-authorized context the AI layer is allowed to see. taskId/phaseId are validated against
 * THIS roadmap's own already-loaded task/phase list before being used for anything — never a
 * cross-roadmap lookup, never an arbitrary id trusted at face value.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await getAuthUser(req);
    const result = await roadmapRepository.findRoadmapByIdForUser(params.id, user.id);
    if (!result) {
      throw new NotFoundError('Roadmap');
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action;
    if (typeof action !== 'string' || !(COPILOT_ACTIONS as readonly string[]).includes(action)) {
      throw new ValidationError(`action must be one of: ${COPILOT_ACTIONS.join(', ')}`);
    }
    const typedAction = action as CopilotAction;

    const isProposalAction = COPILOT_PROPOSAL_ACTIONS.includes(typedAction);
    if (isProposalAction && result.permission !== 'OWNER' && result.permission !== 'EDIT') {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Edit permission required for this copilot action.' } },
        { status: 403 }
      );
    }

    await roadmapCopilotService.assertEnabled();

    const context = body.context && typeof body.context === 'object' ? body.context : {};
    const allTasks = result.roadmap.phases.flatMap((p) => p.tasks);
    const allPhaseIds = new Set(result.roadmap.phases.map((p) => p.id));

    let taskId: string | undefined;
    if (context.taskId !== undefined) {
      if (typeof context.taskId !== 'string' || !allTasks.some((t) => t.id === context.taskId)) {
        throw new ValidationError('context.taskId must be a task belonging to this roadmap.');
      }
      taskId = context.taskId;
    }

    let phaseId: string | undefined;
    if (context.phaseId !== undefined) {
      if (typeof context.phaseId !== 'string' || !allPhaseIds.has(context.phaseId)) {
        throw new ValidationError('context.phaseId must be a phase belonging to this roadmap.');
      }
      phaseId = context.phaseId;
    }

    // Exactly two queries total (mirrors the insights route precisely) — everything else is pure
    // computation over already-loaded data.
    const dependencyEdges = await roadmapRepository.listDependencyEdgesForRoadmap(params.id);
    const [reminderConfig, bottleneckConfig] = await Promise.all([loadRoadmapReminderConfig(), loadRoadmapBottleneckConfig()]);
    const insights = computeRoadmapInsights(result.roadmap.phases, dependencyEdges, reminderConfig, bottleneckConfig);

    const includeTaskDescription = typedAction === 'REFINE_TASK' || typedAction === 'SUGGEST_SUBTASKS';
    let copilotContext = buildCopilotContext({
      roadmapTitle: result.roadmap.title,
      insights,
      rawPhases: result.roadmap.phases,
      taskId,
      phaseId,
      includeTaskDescription
    });

    // RAG-Grounded Context — optional, bounded, authorized retrieval. Only attempted for actions
    // that can meaningfully benefit (never for SUMMARIZE_PROGRESS/SHARE_PROGRESS_SUMMARY, and
    // never for RECOMMEND_ACTIONS' zero-LLM-call deterministic fast path). A retrieval failure,
    // disablement, or lack of a safe roadmap-to-project scope degrades silently — the copilot
    // request itself never fails because of this.
    const wantsAiAdvice = context.wantsAiAdvice === true;
    const isRetrievalEligible =
      COPILOT_RETRIEVAL_ELIGIBLE_ACTIONS.includes(typedAction) && (typedAction !== 'RECOMMEND_ACTIONS' || wantsAiAdvice);
    if (isRetrievalEligible) {
      const retrievalQuery = buildRetrievalQuery(typedAction, copilotContext);
      if (retrievalQuery) {
        const ragConfig = await loadRoadmapCopilotRagConfig();
        const retrievalContext = await roadmapCopilotRetrievalService.retrieve({
          roadmapId: params.id,
          userId: user.id,
          query: retrievalQuery,
          config: ragConfig
        });
        copilotContext = { ...copilotContext, retrievalContext };
      }
    }

    let response;
    switch (typedAction) {
      case 'EXPLAIN_HEALTH':
      case 'EXPLAIN_BOTTLENECKS':
      case 'EXPLAIN_DEPENDENCY':
      case 'SUMMARIZE_PROGRESS':
        response = await roadmapCopilotService.explain(typedAction, copilotContext, user.id);
        break;

      case 'RECOMMEND_ACTIONS':
        response = await roadmapCopilotService.recommendActions(copilotContext, wantsAiAdvice, user.id);
        break;

      case 'REFINE_TASK':
      case 'SUGGEST_SUBTASKS':
        if (!taskId) {
          throw new ValidationError('context.taskId is required for this action.');
        }
        response = await roadmapCopilotService.proposeChanges(typedAction, copilotContext, user.id);
        break;

      case 'SUGGEST_DEPENDENCIES':
        response = await roadmapCopilotService.proposeChanges(typedAction, copilotContext, user.id, {
          taskRefs: insights.tasks.map((t) => ({ id: t.id, title: t.title })),
          existingEdges: dependencyEdges
        });
        break;

      case 'SHARE_PROGRESS_SUMMARY': {
        const channelId = context.channelId;
        if (!channelId || typeof channelId !== 'string') {
          throw new ValidationError('context.channelId is required to share a summary.');
        }
        // Membership check FIRST (mirroring the discuss/schedule-message endpoints exactly) —
        // sendMessage re-validates internally regardless, but checking here keeps this route's
        // own error message clear and consistent with those endpoints.
        const membership = await prisma.collabChannelMember.findUnique({
          where: { channelId_userId: { channelId, userId: user.id } }
        });
        if (!membership) {
          throw new AppError('Access Denied: Not a member of this channel', 403, 'FORBIDDEN');
        }
        response = await roadmapCopilotService.shareSummary(copilotContext, channelId, user.id);
        break;
      }
    }

    return NextResponse.json({ success: true, data: response });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to process copilot request.' } },
      { status: 500 }
    );
  }
}
