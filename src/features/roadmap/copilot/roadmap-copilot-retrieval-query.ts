import { CopilotAction } from './roadmap-copilot.types';
import { CopilotRoadmapContext } from './roadmap-copilot-context';

const MAX_QUERY_CHARS = 300;

/**
 * Deterministic, action-specific retrieval query builder — pure, zero I/O. Returns null when the
 * action either never benefits from retrieval (SUMMARIZE_PROGRESS/SHARE_PROGRESS_SUMMARY — a
 * concise status summary needs no document grounding) or when there is genuinely nothing
 * meaningful to search for yet (e.g. EXPLAIN_HEALTH on an already-HEALTHY roadmap, or a focus
 * action with no focus task resolved). The caller (the copilot route) treats null as "skip
 * retrieval for this request" — never a fallback to searching everything.
 */
export function buildRetrievalQuery(action: CopilotAction, context: CopilotRoadmapContext): string | null {
  let query: string | null;

  switch (action) {
    case 'REFINE_TASK':
    case 'SUGGEST_SUBTASKS':
      query = context.focusTask ? [context.focusTask.title, context.focusTask.description].filter(Boolean).join(' — ') : null;
      break;

    case 'EXPLAIN_DEPENDENCY':
      query = context.focusTask ? `${context.focusTask.title} dependencies and downstream impact in ${context.roadmapTitle}` : null;
      break;

    case 'RECOMMEND_ACTIONS':
      if (!context.nextStep) {
        query = null;
      } else if ('executable' in context.nextStep && context.nextStep.executable === false) {
        query = `${context.nextStep.taskTitle} blocked dependency ${context.roadmapTitle}`;
      } else {
        query = `${context.nextStep.taskTitle} ${context.roadmapTitle}`;
      }
      break;

    case 'EXPLAIN_HEALTH':
      query = context.executionHealth.status === 'HEALTHY'
        ? null
        : `${context.roadmapTitle} execution health ${context.executionHealth.status} ${context.bottlenecks.map((b) => b.type).join(' ')}`.trim();
      break;

    case 'EXPLAIN_BOTTLENECKS':
      query = context.bottlenecks.length === 0 ? null : `${context.roadmapTitle} ${context.bottlenecks.map((b) => b.type).join(' ')}`;
      break;

    case 'SUGGEST_DEPENDENCIES':
      query = `${context.roadmapTitle} task dependencies and sequencing`;
      break;

    default:
      // SUMMARIZE_PROGRESS / SHARE_PROGRESS_SUMMARY — never retrieval-eligible (Section 9).
      query = null;
  }

  if (!query || !query.trim()) return null;
  return query.trim().slice(0, MAX_QUERY_CHARS);
}
