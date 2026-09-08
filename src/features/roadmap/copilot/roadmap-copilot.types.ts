/**
 * AI Roadmap Copilot — deterministic roadmap logic remains the source of truth throughout this
 * feature. The AI layer may interpret/summarize/explain/recommend and propose actions, but it
 * NEVER mutates roadmap data directly and NEVER overrides a deterministic result (see
 * roadmap-copilot.service.ts's own doc comment for how this is enforced at the type/validation
 * level, not just by convention).
 */

export const COPILOT_ACTIONS = [
  'EXPLAIN_HEALTH',
  'EXPLAIN_BOTTLENECKS',
  'RECOMMEND_ACTIONS',
  'EXPLAIN_DEPENDENCY',
  'SUMMARIZE_PROGRESS',
  'REFINE_TASK',
  'SUGGEST_SUBTASKS',
  'SUGGEST_DEPENDENCIES',
  'SHARE_PROGRESS_SUMMARY'
] as const;

export type CopilotAction = (typeof COPILOT_ACTIONS)[number];

/** Actions requiring only roadmap read access (OWNER/EDIT/VIEW) — matches the existing insights
 * endpoint's own permission bar exactly, since these never produce a mutation. */
export const COPILOT_READ_ACTIONS: CopilotAction[] = [
  'EXPLAIN_HEALTH', 'EXPLAIN_BOTTLENECKS', 'RECOMMEND_ACTIONS', 'EXPLAIN_DEPENDENCY', 'SUMMARIZE_PROGRESS', 'SHARE_PROGRESS_SUMMARY'
];

/** Actions that produce a PROPOSAL a user could go on to accept — gated at the same OWNER/EDIT
 * bar as the actual mutation endpoints they'd eventually call, so a VIEW-only user (who could
 * never act on the proposal anyway) never spends an LLM call on one. */
export const COPILOT_PROPOSAL_ACTIONS: CopilotAction[] = ['REFINE_TASK', 'SUGGEST_SUBTASKS', 'SUGGEST_DEPENDENCIES'];

/** Model self-reported confidence ONLY — never presented as objective/deterministic truth. There
 * is no deterministic way to score "how likely is this LLM suggestion correct," so this is
 * deliberately a coarse qualitative label (matching how the UI labels it: "Model confidence"),
 * never a fabricated numeric probability. */
export type ProposalConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export type CopilotProposalType = 'REFINE_TASK' | 'SUGGEST_SUBTASK' | 'SUGGEST_DEPENDENCY';

export interface CopilotProposal {
  type: CopilotProposalType;
  target: { taskId?: string; phaseId?: string };
  /** The exact, already-validated field values the client would submit to the EXISTING canonical
   * API on Accept (e.g. {title, description} for REFINE_TASK via PATCH .../tasks/[taskId];
   * {notes} for SUGGEST_SUBTASK via the same PATCH; {dependsOnTaskId} for SUGGEST_DEPENDENCY via
   * POST .../tasks/[taskId]/dependencies). Never applied automatically — Accept is a distinct,
   * explicit user action in the UI that calls that existing endpoint itself. */
  suggestedChange: Record<string, unknown>;
  explanation: string;
  confidence: ProposalConfidence;
  /** References deterministic roadmap facts where possible (e.g. "Setup Database and Create Auth
   * are both in the Foundations phase and are currently unordered relative to each other"). */
  evidence: string;
}

export interface CopilotResponse {
  action: CopilotAction;
  /** Deterministic, sourced directly from context — the LLM never generates or alters these. */
  facts: string[];
  /** AI-generated interpretation of the facts above. Absent for the zero-LLM-call fast path. */
  analysis?: string;
  /** AI-generated supporting suggestions — explicitly NOT the authoritative next step. */
  recommendations?: string[];
  /** The deterministic getNextStep() result — present only for RECOMMEND_ACTIONS, always the
   * authoritative pick, never silently overridden by `recommendations` above. */
  deterministicNextStep?: unknown;
  proposals?: CopilotProposal[];
  /** false for the zero-LLM-call deterministic fast path (default RECOMMEND_ACTIONS) — lets the
   * UI/observability distinguish "answered instantly from deterministic data" from "required an
   * AI call." */
  usedAi: boolean;
  /** Reserved for a future RAG-integration pass (see roadmap-copilot-context.ts) — always false
   * this phase, since RAG is never automatically invoked. */
  usedRag: boolean;
  sharedMessage?: { id: string; channelId: string };
}
