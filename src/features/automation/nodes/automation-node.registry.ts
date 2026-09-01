import { AutomationNodeType } from '@prisma/client';

/**
 * Phase 88 — the closed Automation Node Registry.
 *
 * Mirrors the security posture of src/features/ai-agent/tool-registry.ts: a statically-defined,
 * server-side-only map of the exactly 10 node types this feature will ever support. There is no
 * dynamic node type, no `eval`/`Function`, and no way for an automation's stored JSON definition
 * to reference a node type outside this map — automation-engine.service.ts looks up every node's
 * behavior ONLY by this registry's keys.
 *
 * `requiresApproval` here is documentation/validation only (used when persisting/activating an
 * automation, so a human author can see which nodes will eventually gate on approval). The actual
 * enforcement authority for approval is entirely Phase 87's existing execution-engine.service.ts
 * (`step.approvalDecision !== 'APPROVED'` blocks non-READ_ONLY steps) — this registry's flag is
 * NEVER used to bypass or duplicate that gate.
 */

export interface AutomationNodeDefinition {
  type: AutomationNodeType;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  /** Project permission required when the automation is project-scoped. Reuses
   * projectAuthorizationService's existing ProjectPermission union — no new permission strings
   * are ever invented here. */
  requiredPermission?: 'VIEW_PROJECT' | 'EDIT_PROJECT';
  requiresApproval: boolean;
  timeoutMs: number;
  retryable: boolean;
  validate: (_config: unknown) => { valid: boolean; errors?: string[] };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function requireStringFields(config: unknown, fields: string[]): { valid: boolean; errors?: string[] } {
  if (!isPlainObject(config)) {
    return { valid: false, errors: ['config must be an object'] };
  }
  const errors: string[] = [];
  for (const field of fields) {
    const value = config[field];
    if (typeof value !== 'string' || !value.trim()) {
      errors.push(`config.${field} is required and must be a non-empty string`);
    }
  }
  return { valid: errors.length === 0, errors: errors.length ? errors : undefined };
}

const alwaysValid = () => ({ valid: true });

export const AUTOMATION_NODE_REGISTRY: Record<AutomationNodeType, AutomationNodeDefinition> = {
  TRIGGER: {
    type: 'TRIGGER',
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', description: 'Pass-through of the triggering domain event payload.' },
    requiredPermission: 'VIEW_PROJECT',
    requiresApproval: false,
    timeoutMs: 5000,
    retryable: false,
    validate: alwaysValid
  },
  CONDITION: {
    type: 'CONDITION',
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', properties: { matched: { type: 'boolean' } } },
    requiredPermission: 'VIEW_PROJECT',
    requiresApproval: false,
    timeoutMs: 5000,
    retryable: false,
    // A CONDITION node's own config carries no fields — its branching logic lives entirely on
    // the outgoing AutomationDefinitionEdge.condition objects, validated at the definition level.
    validate: alwaysValid
  },
  AI_ANALYSIS: {
    type: 'AI_ANALYSIS',
    inputSchema: {
      type: 'object',
      properties: { promptTemplate: { type: 'string' }, timeoutMs: { type: 'number' } },
      required: ['promptTemplate']
    },
    outputSchema: { type: 'object', description: 'Structured LLM output (read-only reasoning, no side effects).' },
    requiredPermission: 'VIEW_PROJECT',
    requiresApproval: false,
    timeoutMs: 30000,
    retryable: true,
    validate: (config) => requireStringFields(config, ['promptTemplate'])
  },
  AI_AGENT: {
    type: 'AI_AGENT',
    inputSchema: {
      type: 'object',
      properties: { goalTemplate: { type: 'string' } },
      required: ['goalTemplate']
    },
    outputSchema: { type: 'object', description: 'The resulting AgentRun summary (id, status, resultSummary).' },
    requiredPermission: 'EDIT_PROJECT',
    // Ultimately executes through the Phase 87 engine, which independently re-enforces its OWN
    // approval gate for any non-READ_ONLY step — never bypassed here.
    requiresApproval: true,
    timeoutMs: 120000,
    retryable: false,
    validate: (config) => requireStringFields(config, ['goalTemplate'])
  },
  APPROVAL: {
    type: 'APPROVAL',
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', description: 'Marker node — realized entirely by the underlying AgentPlanStep approval gate.' },
    requiredPermission: 'EDIT_PROJECT',
    requiresApproval: true,
    timeoutMs: 120000,
    retryable: false,
    validate: alwaysValid
  },
  CLICKUP_ACTION: {
    type: 'CLICKUP_ACTION',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create', 'update'] },
        listId: { type: 'string', description: 'Required when action="create".' },
        taskId: { type: 'string', description: 'Required when action="update".' },
        nameTemplate: { type: 'string' },
        descriptionTemplate: { type: 'string' }
      },
      required: ['action']
    },
    outputSchema: { type: 'object', description: 'The created/updated ClickUp task summary (id, name, url, status).' },
    requiredPermission: 'EDIT_PROJECT',
    requiresApproval: true,
    timeoutMs: 30000,
    retryable: false,
    validate: (config) => {
      if (!isPlainObject(config)) return { valid: false, errors: ['config must be an object'] };
      const action = config.action;
      if (action !== 'create' && action !== 'update') {
        return { valid: false, errors: ['config.action must be "create" or "update"'] };
      }
      if (action === 'create' && typeof config.listId !== 'string') {
        return { valid: false, errors: ['config.listId is required when action="create"'] };
      }
      if (action === 'update' && typeof config.taskId !== 'string') {
        return { valid: false, errors: ['config.taskId is required when action="update"'] };
      }
      return { valid: true };
    }
  },
  CALENDAR_ACTION: {
    type: 'CALENDAR_ACTION',
    inputSchema: {
      type: 'object',
      properties: {
        titleTemplate: { type: 'string' },
        startTimeTemplate: { type: 'string' },
        endTimeTemplate: { type: 'string' },
        descriptionTemplate: { type: 'string' }
      },
      required: ['titleTemplate', 'startTimeTemplate', 'endTimeTemplate']
    },
    outputSchema: { type: 'object', description: 'The created Calendar event summary (eventId, htmlLink, meetUrl).' },
    requiredPermission: 'EDIT_PROJECT',
    requiresApproval: true,
    timeoutMs: 30000,
    retryable: false,
    validate: (config) => requireStringFields(config, ['titleTemplate', 'startTimeTemplate', 'endTimeTemplate'])
  },
  NOTIFICATION: {
    type: 'NOTIFICATION',
    inputSchema: {
      type: 'object',
      properties: { titleTemplate: { type: 'string' }, bodyTemplate: { type: 'string' } },
      required: ['titleTemplate', 'bodyTemplate']
    },
    outputSchema: { type: 'object', properties: { notificationId: { type: 'string' } } },
    requiredPermission: 'VIEW_PROJECT',
    requiresApproval: false,
    timeoutMs: 10000,
    retryable: true,
    validate: (config) => requireStringFields(config, ['titleTemplate', 'bodyTemplate'])
  },
  DELAY: {
    type: 'DELAY',
    inputSchema: {
      type: 'object',
      properties: { delayMs: { type: 'number' } },
      required: ['delayMs']
    },
    outputSchema: { type: 'object', properties: { nextRunAt: { type: 'string' } } },
    requiredPermission: 'VIEW_PROJECT',
    requiresApproval: false,
    timeoutMs: 5000,
    retryable: false,
    validate: (config) => {
      if (!isPlainObject(config) || typeof config.delayMs !== 'number' || config.delayMs <= 0) {
        return { valid: false, errors: ['config.delayMs is required and must be a positive number'] };
      }
      return { valid: true };
    }
  },
  END: {
    type: 'END',
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', properties: { finalStatus: { type: 'string' } } },
    requiredPermission: 'VIEW_PROJECT',
    requiresApproval: false,
    timeoutMs: 5000,
    retryable: false,
    validate: alwaysValid
  }
};

export function getNodeDefinition(type: string): AutomationNodeDefinition | undefined {
  return AUTOMATION_NODE_REGISTRY[type as AutomationNodeType];
}

export function listNodeTypes(): AutomationNodeType[] {
  return Object.keys(AUTOMATION_NODE_REGISTRY) as AutomationNodeType[];
}
