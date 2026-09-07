/**
 * Strict allow-list — the ONLY action identifiers this system will ever execute. There is no
 * generic "execute arbitrary action" API; a request naming anything outside this union is
 * rejected before any execution is attempted (see rag-incident-action.service.ts).
 */
export type RagIncidentActionType = 'INVALIDATE_ANSWER_CACHE' | 'REFRESH_CONFIG_CACHE' | 'RERUN_HEALTH_EVALUATION';

export type RagIncidentActionRisk = 'LOW' | 'MEDIUM' | 'HIGH';

export type RagIncidentActionStatus = 'REQUESTED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface RagIncidentActionDefinition {
  actionType: RagIncidentActionType;
  label: string;
  description: string;
  riskLevel: RagIncidentActionRisk;
  /** Whether the frontend must show an explicit "this changes production behavior" confirmation
   * before calling the execute endpoint. None of the three actions currently implemented change
   * retrieval/GraphRAG/citation/chat behavior, so none require it today — the field exists so a
   * future action that DOES change production behavior has somewhere safe to declare that. */
  requiresConfirmation: boolean;
  reversible: boolean;
  backgroundExecutionRequired: boolean;
}

export interface RagIncidentActionResult {
  requestId: string;
  actionType: RagIncidentActionType;
  status: RagIncidentActionStatus;
  /** Safe, operator-facing summary only — never a raw provider error, stack trace, or internal
   * exception message. */
  resultSummary: string;
}
