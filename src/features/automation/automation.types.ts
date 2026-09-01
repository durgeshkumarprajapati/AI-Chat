import { AutomationNodeType } from '@prisma/client';

/**
 * Phase 88 — the shape of `AutomationVersion.definition` (persisted as Json). A small, bounded
 * node-graph: nodes + edges. There is deliberately NO expression language, NO arbitrary code, and
 * NO dynamic node types here — see automation-node.registry.ts for the closed set of node types
 * and automation-engine.service.ts for the walk algorithm.
 */
export interface AutomationDefinitionNode {
  /** Unique within this definition — referenced by edges. */
  key: string;
  type: AutomationNodeType;
  /** Node-type-specific configuration, validated by AUTOMATION_NODE_REGISTRY[type].validate(). */
  config?: Record<string, unknown>;
}

/** A small, safe comparator over a dot-path value read from the walk context — see
 * resolveDotPath()/evaluateCondition() in automation-engine.service.ts. Never a general
 * expression language. */
export interface AutomationEdgeCondition {
  path: string;
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists';
  value?: unknown;
}

export interface AutomationDefinitionEdge {
  from: string;
  to: string;
  /** Present only on edges out of a CONDITION node (or as an additional guard on any node) — if
   * omitted, this edge is an unconditional/default edge. */
  condition?: AutomationEdgeCondition;
  /** When true, this edge is only eligible when the source node's step ended FAILED — used to
   * let a graph reach END gracefully after a failure rather than hard-stopping the whole
   * execution with no terminal node reached. */
  onFailure?: boolean;
}

export interface AutomationDefinition {
  nodes: AutomationDefinitionNode[];
  edges: AutomationDefinitionEdge[];
}

export interface AutomationValidationResult {
  valid: boolean;
  errors: string[];
}
