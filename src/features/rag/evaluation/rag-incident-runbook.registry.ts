import { RagHealthAlertCategory, RagHealthAlertSeverity } from '@prisma/client';
import { RagIncidentActionType } from './rag-incident-action.types';

export type RunbookActionKind = 'AUTOMATIC' | 'MANUAL' | 'CONFIRMATION_REQUIRED';

export interface RunbookRecommendedAction {
  label: string;
  kind: RunbookActionKind;
  /** Links to an allow-listed action this admin can execute directly, or null for a purely
   * manual/human step (e.g. "review recent configuration changes") with no safe automatable
   * equivalent found in the existing codebase. */
  actionType: RagIncidentActionType | null;
}

export interface RunbookRecommendation {
  id: string;
  title: string;
  description: string;
  severityRelevance: RagHealthAlertSeverity[];
  diagnosticChecks: string[];
  recommendedActions: RunbookRecommendedAction[];
}

/**
 * Deterministic, in-code mapping (no new DB table, no ITSM platform) — mirrors this codebase's
 * established "static registry" convention (tour-registry.ts, architecture-registry.ts,
 * automation-node.registry.ts). Every recommended action is explicitly informational —
 * recommendations are never guaranteed to resolve an incident; only the existing health detection
 * lifecycle can actually resolve one. Stores no raw prompts/questions/answers/documents — every
 * string here is static, author-written operational guidance.
 */
export const RAG_INCIDENT_RUNBOOKS: Record<RagHealthAlertCategory, RunbookRecommendation[]> = {
  RETRIEVAL: [
    {
      id: 'retrieval-degradation',
      title: 'Retrieval degradation',
      description: 'Retrieval latency, zero-chunk rate, or cache hit rate has moved outside expected bounds. This does not by itself indicate an answer-quality problem — inspect the diagnostics below before concluding anything.',
      severityRelevance: ['WARNING', 'CRITICAL'],
      diagnosticChecks: [
        'Inspect retrieval latency and zero-chunk rate for this window',
        'Inspect cache hit rate — a sudden drop can indicate cold caches or a cache-invalidation storm',
        'Review recent configuration changes to retrieval-related settings',
        'Verify dependency availability (database, vector index)'
      ],
      recommendedActions: [
        { label: 'Invalidate answer cache', kind: 'AUTOMATIC', actionType: 'INVALIDATE_ANSWER_CACHE' },
        { label: 'Refresh configuration cache', kind: 'AUTOMATIC', actionType: 'REFRESH_CONFIG_CACHE' },
        { label: 'Review recent configuration changes', kind: 'MANUAL', actionType: null },
        { label: 'Re-run health evaluation to confirm current state', kind: 'AUTOMATIC', actionType: 'RERUN_HEALTH_EVALUATION' }
      ]
    }
  ],
  GRAPH: [
    {
      id: 'graph-degradation',
      title: 'GraphRAG degradation',
      description: 'Graph attempt rate, success rate, or latency has moved outside expected bounds. There is currently no safe, existing switch to disable graph augmentation from this UI — see Known Limitations.',
      severityRelevance: ['WARNING', 'CRITICAL'],
      diagnosticChecks: [
        'Inspect graph attempt rate and success rate for this window',
        'Inspect graph latency and failure-category distribution',
        'Review graph-related feature configuration in Manage Configs'
      ],
      recommendedActions: [
        { label: 'Review graph-related feature configuration', kind: 'MANUAL', actionType: null },
        { label: 'Re-run health evaluation to confirm current state', kind: 'AUTOMATIC', actionType: 'RERUN_HEALTH_EVALUATION' }
      ]
    }
  ],
  CITATION: [
    {
      id: 'citation-degradation',
      title: 'Citation attribution degradation',
      description: 'Uncited-answer rate, invalid/malformed reference rate, or attribution quality distribution has moved outside expected bounds.',
      severityRelevance: ['WARNING', 'CRITICAL'],
      diagnosticChecks: [
        'Inspect attribution quality distribution for this window',
        'Inspect evidence reference (referenced vs. retrieved) rates',
        'Inspect invalid/malformed reference counts'
      ],
      recommendedActions: [
        { label: 'Invalidate answer cache', kind: 'AUTOMATIC', actionType: 'INVALIDATE_ANSWER_CACHE' },
        { label: 'Re-run health evaluation to confirm current state', kind: 'AUTOMATIC', actionType: 'RERUN_HEALTH_EVALUATION' }
      ]
    }
  ],
  RELIABILITY: [
    {
      id: 'reliability-degradation',
      title: 'Reliability degradation',
      description: 'Request failure count or total latency has moved outside expected bounds.',
      severityRelevance: ['WARNING', 'CRITICAL'],
      diagnosticChecks: [
        'Inspect request failure counters for this window',
        'Inspect worker logs for the same time window',
        'Inspect dependency health (database, Redis, queue)'
      ],
      recommendedActions: [
        { label: 'Inspect worker logs', kind: 'MANUAL', actionType: null },
        { label: 'Inspect dependency health', kind: 'MANUAL', actionType: null },
        { label: 'Re-run health evaluation to confirm current state', kind: 'AUTOMATIC', actionType: 'RERUN_HEALTH_EVALUATION' }
      ]
    }
  ]
};

/** Safe fallback for a category with no mapped runbook (should not happen given the enum above is
 * exhaustive, but guards against a future new category being added to the enum before a runbook
 * is authored for it). */
export function getRunbookRecommendations(category: RagHealthAlertCategory): RunbookRecommendation[] {
  return RAG_INCIDENT_RUNBOOKS[category] ?? [];
}
