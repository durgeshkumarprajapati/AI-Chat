import { RagIncidentActionDefinition, RagIncidentActionType } from './rag-incident-action.types';

/**
 * The complete, explicit allow-list of executable RAG incident actions. Audited against the
 * actual codebase (see this phase's final report) before being added here — each is already
 * supported by existing infrastructure, reversible/low-risk, and requires no change to
 * retrieval/GraphRAG/citation/chat behavior. Deliberately does NOT include a "disable GraphRAG"
 * or similar production-behavior-changing action: no existing feature flag gates that behavior at
 * answer time, and adding one would require modifying the protected retrieval/GraphRAG code path.
 */
export const RAG_INCIDENT_ACTIONS: Record<RagIncidentActionType, RagIncidentActionDefinition> = {
  INVALIDATE_ANSWER_CACHE: {
    actionType: 'INVALIDATE_ANSWER_CACHE',
    label: 'Invalidate Answer Cache',
    description: 'Clears the cached exact-match RAG answers so the next matching request recomputes rather than reusing a potentially stale cached answer. Reuses the existing RAGCacheProvider.invalidateDocument() platform-wide invalidation.',
    riskLevel: 'LOW',
    requiresConfirmation: false,
    reversible: true,
    backgroundExecutionRequired: false
  },
  REFRESH_CONFIG_CACHE: {
    actionType: 'REFRESH_CONFIG_CACHE',
    label: 'Refresh Configuration Cache',
    description: 'Forces every app/worker instance to re-read configuration from the database on next access, via the existing configCacheService.invalidateAll() (already multi-instance-safe via Redis Pub/Sub).',
    riskLevel: 'LOW',
    requiresConfirmation: false,
    reversible: true,
    backgroundExecutionRequired: false
  },
  RERUN_HEALTH_EVALUATION: {
    actionType: 'RERUN_HEALTH_EVALUATION',
    label: 'Re-run Health Evaluation',
    description: 'Triggers an on-demand run of the exact same deterministic health check the scheduler already runs periodically, guarded by the SAME distributed lock, so alert state reflects the most current data sooner. Cannot resolve this incident directly — only the existing detection lifecycle can do that.',
    riskLevel: 'LOW',
    requiresConfirmation: false,
    reversible: true,
    backgroundExecutionRequired: true
  }
};

export function getActionDefinition(actionType: string): RagIncidentActionDefinition | null {
  return Object.prototype.hasOwnProperty.call(RAG_INCIDENT_ACTIONS, actionType)
    ? RAG_INCIDENT_ACTIONS[actionType as RagIncidentActionType]
    : null;
}

export function listActionDefinitions(): RagIncidentActionDefinition[] {
  return Object.values(RAG_INCIDENT_ACTIONS);
}
