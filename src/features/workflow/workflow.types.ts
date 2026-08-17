import {
  WorkflowStatus,
  WorkflowRunStatus,
  WorkflowRunNodeStatus,
  WorkflowTriggerType,
  WorkflowVariableType,
  WorkflowSharePermission
} from '@prisma/client';

export {
  WorkflowStatus,
  WorkflowRunStatus,
  WorkflowRunNodeStatus,
  WorkflowTriggerType,
  WorkflowVariableType,
  WorkflowSharePermission
};

export interface CanonicalNodeDefinition {
  key: string;
  type: string;
  version?: number;
  label?: string;
  position?: { x: number; y: number };
  config?: Record<string, unknown>;
}

export interface CanonicalEdgeDefinition {
  id?: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  condition?: string;
}

export interface CanonicalWorkflowDefinition {
  version: number;
  nodes: CanonicalNodeDefinition[];
  edges: CanonicalEdgeDefinition[];
}

export interface RegisteredNodeDefinition {
  type: string;
  version: number;
  label: string;
  description: string;
  category: 'TRIGGERS' | 'DATA' | 'AI' | 'LOGIC' | 'DOCUMENT' | 'RESEARCH' | 'OUTPUT' | 'CONTROL';
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  configSchema: Record<string, unknown>;
  permissions?: string[];
  timeoutMs?: number;
}

export interface CreateWorkflowInput {
  name: string;
  description?: string;
  definition?: CanonicalWorkflowDefinition;
  variables?: Array<{ name: string; type: WorkflowVariableType; defaultValue?: string; isSecret?: boolean }>;
  triggers?: Array<{ type: WorkflowTriggerType; configuration?: Record<string, unknown>; enabled?: boolean }>;
}

export interface WorkflowExecutionTelemetry {
  workflowId: string;
  versionId: string;
  runId: string;
  status: WorkflowRunStatus;
  stepCount: number;
  nodesExecuted: number;
  llmCalls: number;
  webSearches: number;
  documentRetrievals: number;
  totalDurationMs: number;
}
