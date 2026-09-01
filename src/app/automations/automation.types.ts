/**
 * Phase 88 Part A — AI Workflow Automation UI.
 *
 * Shared types/constants for the `/automations`, `/automations/[id]`, and
 * `/automations/[id]/executions` pages. Mirrors the backend contract verbatim (see the Phase 88
 * spec) — this file is additive and owned entirely by this feature; nothing outside
 * `src/app/automations/**` imports it.
 *
 * NAMING NOTE: this is a completely different feature from the existing `/workflows` pages
 * (Phase 35 "AI Workflow Builder", backed by `src/features/workflow/` — singular). This feature's
 * backend lives at `src/features/automation/` (plural) and `/api/automations/**`. Do not confuse
 * the two — nothing here imports from `src/features/workflow/`.
 */

import type { BadgeVariant } from '@/components/ui/Badge';

export type AutomationStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type AutomationExecutionStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'WAITING_APPROVAL'
  | 'COMPLETED'
  | 'PARTIALLY_COMPLETED'
  | 'FAILED'
  | 'CANCELLED';
export type AutomationStepStatus = 'PENDING' | 'RUNNING' | 'WAITING_APPROVAL' | 'SUCCEEDED' | 'FAILED' | 'SKIPPED' | 'CANCELLED';
export type AutomationTriggerType =
  | 'MEETING_ANALYSIS_COMPLETED'
  | 'AI_INTELLIGENCE_RISK_DETECTED'
  | 'AI_INTELLIGENCE_BLOCKER_DETECTED'
  | 'AI_INTELLIGENCE_DEADLINE_RISK_DETECTED'
  | 'DOCUMENT_PROCESSING_COMPLETED'
  | 'KNOWLEDGE_CONTRADICTION_DETECTED'
  | 'MANUAL';
export type AutomationNodeType =
  | 'TRIGGER'
  | 'CONDITION'
  | 'AI_ANALYSIS'
  | 'AI_AGENT'
  | 'APPROVAL'
  | 'CLICKUP_ACTION'
  | 'CALENDAR_ACTION'
  | 'NOTIFICATION'
  | 'DELAY'
  | 'END';

export interface AutomationNodeDTO {
  key: string;
  type: AutomationNodeType;
  position: { x: number; y: number };
  config: Record<string, unknown>;
}

export type ConditionOp = 'eq' | 'neq' | 'gt' | 'lt';

export interface AutomationEdgeCondition {
  path: string;
  op: ConditionOp;
  value: unknown;
}

export interface AutomationEdgeDTO {
  id: string;
  source: string;
  target: string;
  condition?: AutomationEdgeCondition | null;
}

export interface AutomationDefinitionDTO {
  nodes: AutomationNodeDTO[];
  edges: AutomationEdgeDTO[];
}

export interface AutomationSummaryDTO {
  id: string;
  name: string;
  description: string | null;
  status: AutomationStatus;
  isActive: boolean;
  projectId: string | null;
  currentVersionNumber: number | null;
  triggerTypes: AutomationTriggerType[];
  lastExecutionAt: string | null;
  lastExecutionStatus: AutomationExecutionStatus | null;
  executionCount7d: number;
  successRate7d: number | null; // 0-1, null if no executions yet — NEVER fabricate a rate with zero data
  createdAt: string;
  updatedAt: string;
}

export interface AutomationVersionRef {
  id: string;
  versionNumber: number;
  createdAt: string;
  createdByUserId: string;
}

export interface AutomationDetailDTO extends AutomationSummaryDTO {
  currentVersion: { id: string; versionNumber: number; definition: AutomationDefinitionDTO; createdAt: string } | null;
  versions: AutomationVersionRef[];
  triggerBindings: AutomationTriggerBindingDTO[];
}

export interface AutomationTriggerBindingDTO {
  id: string;
  triggerType: AutomationTriggerType;
  enabled: boolean;
  filterJson: Record<string, unknown> | null;
}

export interface AutomationExecutionSummaryDTO {
  id: string;
  automationId: string;
  status: AutomationExecutionStatus;
  triggerType: AutomationTriggerType;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  agentRunId: string | null;
}

export interface AutomationExecutionStepDTO {
  id: string;
  nodeKey: string;
  nodeType: AutomationNodeType;
  status: AutomationStepStatus;
  sanitizedInput: Record<string, unknown> | null;
  sanitizedOutput: Record<string, unknown> | null;
  errorMessage: string | null;
  retryCount: number;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AutomationExecutionDetailDTO extends AutomationExecutionSummaryDTO {
  steps: AutomationExecutionStepDTO[];
}

/* ---------------------------------------------------------------------------------------------
 * Display constants
 * ------------------------------------------------------------------------------------------- */

export const AUTOMATION_STATUS_BADGE: Record<AutomationStatus, BadgeVariant> = {
  DRAFT: 'neutral',
  ACTIVE: 'success',
  PAUSED: 'warning',
  ARCHIVED: 'neutral'
};

export const EXECUTION_STATUS_BADGE: Record<AutomationExecutionStatus, BadgeVariant> = {
  QUEUED: 'neutral',
  RUNNING: 'info',
  WAITING_APPROVAL: 'warning',
  COMPLETED: 'success',
  PARTIALLY_COMPLETED: 'warning',
  FAILED: 'destructive',
  CANCELLED: 'neutral'
};

export const STEP_STATUS_BADGE: Record<AutomationStepStatus, BadgeVariant> = {
  PENDING: 'neutral',
  RUNNING: 'info',
  WAITING_APPROVAL: 'warning',
  SUCCEEDED: 'success',
  FAILED: 'destructive',
  SKIPPED: 'neutral',
  CANCELLED: 'neutral'
};

/** ✓ succeeded, ✗ failed, ⏳ running/pending, ⏸ waiting-approval, ⊘ skipped/cancelled — per spec. */
export const STEP_STATUS_ICON: Record<AutomationStepStatus, string> = {
  SUCCEEDED: '✓',
  FAILED: '✗',
  RUNNING: '⏳',
  PENDING: '⏳',
  WAITING_APPROVAL: '⏸',
  SKIPPED: '⊘',
  CANCELLED: '⊘'
};

/**
 * Human labels for the 7 fixed AutomationTriggerType values — used in the "Add Trigger" picker
 * on the detail page and the list page's trigger-type badges.
 */
export const TRIGGER_TYPE_LABEL: Record<AutomationTriggerType, string> = {
  MEETING_ANALYSIS_COMPLETED: 'When a meeting analysis completes',
  AI_INTELLIGENCE_RISK_DETECTED: 'When a critical risk is detected',
  AI_INTELLIGENCE_BLOCKER_DETECTED: 'When a blocker is detected',
  AI_INTELLIGENCE_DEADLINE_RISK_DETECTED: 'When a deadline risk is detected',
  DOCUMENT_PROCESSING_COMPLETED: 'When document processing completes',
  KNOWLEDGE_CONTRADICTION_DETECTED: 'When a knowledge contradiction is detected',
  MANUAL: 'Manually triggered'
};

export const TRIGGER_TYPES: AutomationTriggerType[] = [
  'MEETING_ANALYSIS_COMPLETED',
  'AI_INTELLIGENCE_RISK_DETECTED',
  'AI_INTELLIGENCE_BLOCKER_DETECTED',
  'AI_INTELLIGENCE_DEADLINE_RISK_DETECTED',
  'DOCUMENT_PROCESSING_COMPLETED',
  'KNOWLEDGE_CONTRADICTION_DETECTED',
  'MANUAL'
];

export const AUTOMATION_NODE_TYPES: AutomationNodeType[] = [
  'TRIGGER',
  'CONDITION',
  'AI_ANALYSIS',
  'AI_AGENT',
  'APPROVAL',
  'CLICKUP_ACTION',
  'CALENDAR_ACTION',
  'NOTIFICATION',
  'DELAY',
  'END'
];

/**
 * Node-type -> Badge semantic family mapping for the graph editor's custom node component.
 * `Badge`/`BADGE_VARIANTS` only defines 5 semantic families (success/warning/destructive/info/
 * neutral) — there is no `primary` Badge variant in this codebase (confirmed against
 * `src/lib/design-system/theme.constants.ts`), so TRIGGER/END fall back to `neutral` for the
 * badge itself; the node's card chrome (border/background) uses `border-primary`/`bg-primary/5`
 * accents directly (not a Badge) to still visually distinguish TRIGGER as the graph's entry point
 * and END with a dashed/muted border as the terminal node.
 *
 *  - neutral:     TRIGGER (entry point — primary-accented card), CONDITION (branch/gate),
 *                 DELAY (passive wait), END (terminal — dashed muted card)
 *  - info:        AI_ANALYSIS, AI_AGENT, NOTIFICATION (informational / AI-driven steps)
 *  - warning:     APPROVAL (blocks on a human decision)
 *  - success:     CLICKUP_ACTION, CALENDAR_ACTION (external side-effecting integrations)
 */
export const NODE_TYPE_BADGE_VARIANT: Record<AutomationNodeType, BadgeVariant> = {
  TRIGGER: 'neutral',
  CONDITION: 'neutral',
  AI_ANALYSIS: 'info',
  AI_AGENT: 'info',
  APPROVAL: 'warning',
  CLICKUP_ACTION: 'success',
  CALENDAR_ACTION: 'success',
  NOTIFICATION: 'info',
  DELAY: 'neutral',
  END: 'neutral'
};

export const NODE_TYPE_LABEL: Record<AutomationNodeType, string> = {
  TRIGGER: 'Trigger',
  CONDITION: 'Condition',
  AI_ANALYSIS: 'AI Analysis',
  AI_AGENT: 'AI Agent',
  APPROVAL: 'Approval',
  CLICKUP_ACTION: 'ClickUp Action',
  CALENDAR_ACTION: 'Calendar Action',
  NOTIFICATION: 'Notification',
  DELAY: 'Delay',
  END: 'End'
};

export const NODE_TYPE_ICON: Record<AutomationNodeType, string> = {
  TRIGGER: '⚡',
  CONDITION: '🔀',
  AI_ANALYSIS: '🧠',
  AI_AGENT: '🤖',
  APPROVAL: '✋',
  CLICKUP_ACTION: '📋',
  CALENDAR_ACTION: '📅',
  NOTIFICATION: '🔔',
  DELAY: '⏱️',
  END: '🏁'
};

/* ---------------------------------------------------------------------------------------------
 * Client-side node config validation (UX only — never authoritative; the server validates
 * against the real node registry on publish and returns 400 with per-nodeKey errors, which the
 * editor surfaces verbatim). This is a best-effort TS description of each node type's expected
 * `config` shape so the editor can flag obviously-missing required fields as the user edits,
 * without waiting on a round trip.
 * ------------------------------------------------------------------------------------------- */

export interface NodeConfigFieldSchema {
  key: string;
  label: string;
  type: 'string' | 'number' | 'select' | 'textarea';
  required: boolean;
  options?: string[];
  placeholder?: string;
  helpText?: string;
}

export const NODE_CONFIG_SCHEMA: Record<AutomationNodeType, NodeConfigFieldSchema[]> = {
  TRIGGER: [],
  CONDITION: [
    { key: 'path', label: 'Field path', type: 'string', required: true, placeholder: 'e.g. risk.severity' },
    { key: 'op', label: 'Operator', type: 'select', required: true, options: ['eq', 'neq', 'gt', 'lt'] },
    { key: 'value', label: 'Comparison value', type: 'string', required: true, placeholder: 'e.g. CRITICAL' }
  ],
  AI_ANALYSIS: [
    { key: 'prompt', label: 'Analysis prompt', type: 'textarea', required: true, placeholder: 'What should the AI analyze?' },
    { key: 'model', label: 'Model override', type: 'string', required: false, placeholder: 'Optional — defaults to workspace default' }
  ],
  AI_AGENT: [
    { key: 'goal', label: 'Agent goal', type: 'textarea', required: true, placeholder: 'What should the AI agent accomplish?' }
  ],
  APPROVAL: [
    { key: 'message', label: 'Approval message', type: 'textarea', required: true, placeholder: 'What is the approver being asked to approve?' },
    { key: 'approverRole', label: 'Approver role', type: 'string', required: false, placeholder: 'Optional — defaults to automation owner' }
  ],
  CLICKUP_ACTION: [
    { key: 'action', label: 'Action', type: 'select', required: true, options: ['CREATE_TASK', 'UPDATE_TASK', 'ADD_COMMENT'] },
    { key: 'listId', label: 'ClickUp list ID', type: 'string', required: true }
  ],
  CALENDAR_ACTION: [
    { key: 'action', label: 'Action', type: 'select', required: true, options: ['CREATE_EVENT', 'UPDATE_EVENT'] },
    { key: 'calendarId', label: 'Calendar ID', type: 'string', required: true }
  ],
  NOTIFICATION: [
    { key: 'channel', label: 'Channel', type: 'select', required: true, options: ['IN_APP', 'EMAIL', 'SLACK'] },
    { key: 'message', label: 'Message', type: 'textarea', required: true }
  ],
  DELAY: [
    { key: 'durationMinutes', label: 'Duration (minutes)', type: 'number', required: true, placeholder: 'e.g. 60' }
  ],
  END: []
};

/** UX-only validation — see module doc comment. Returns a human-readable error per missing/empty required field. */
export function validateNodeConfig(type: AutomationNodeType, config: Record<string, unknown>): string[] {
  const schema = NODE_CONFIG_SCHEMA[type] || [];
  const errors: string[] = [];
  for (const field of schema) {
    if (!field.required) continue;
    const value = config[field.key];
    const isEmpty =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '') ||
      (typeof value === 'number' && Number.isNaN(value));
    if (isEmpty) errors.push(`"${field.label}" is required`);
  }
  return errors;
}

export function validateDefinition(definition: AutomationDefinitionDTO): Record<string, string[]> {
  const errorsByNode: Record<string, string[]> = {};
  for (const node of definition.nodes) {
    const errors = validateNodeConfig(node.type, node.config || {});
    if (errors.length > 0) errorsByNode[node.key] = errors;
  }
  return errorsByNode;
}

export function formatSuccessRate(rate: number | null): string {
  if (rate === null) return '—';
  return `${Math.round(rate * 100)}%`;
}

export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remSeconds}s`;
}

export function formatRelativeTime(ts: string | Date | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '—';
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  const abs = Math.abs(diffMin);
  if (abs < 1) return 'just now';
  if (abs < 60) return `${abs}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (Math.abs(diffH) < 24) return `${Math.abs(diffH)}h ago`;
  const diffD = Math.round(diffH / 24);
  if (Math.abs(diffD) < 14) return `${Math.abs(diffD)}d ago`;
  return d.toLocaleDateString();
}
