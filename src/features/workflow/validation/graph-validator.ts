import { CanonicalWorkflowDefinition } from '../workflow.types';
import { workflowNodeRegistry } from '../nodes/workflow-node.registry';
import { WORKFLOW_CONFIG } from '../workflow.constants';

export interface GraphValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class GraphValidator {
  public validateGraph(definition: CanonicalWorkflowDefinition): GraphValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!definition || !Array.isArray(definition.nodes) || !Array.isArray(definition.edges)) {
      return { isValid: false, errors: ['Invalid workflow definition structure.'], warnings: [] };
    }

    const nodes = definition.nodes;
    const edges = definition.edges;

    // 1. Node count limits
    if (nodes.length === 0) {
      errors.push('Workflow must contain at least one node.');
    }
    if (nodes.length > WORKFLOW_CONFIG.SERVER_ABSOLUTE_MAX_NODES) {
      errors.push(`Workflow exceeds maximum node limit of ${WORKFLOW_CONFIG.SERVER_ABSOLUTE_MAX_NODES}.`);
    }
    if (edges.length > WORKFLOW_CONFIG.SERVER_ABSOLUTE_MAX_EDGES) {
      errors.push(`Workflow exceeds maximum edge limit of ${WORKFLOW_CONFIG.SERVER_ABSOLUTE_MAX_EDGES}.`);
    }

    // 2. Node Key uniqueness and registered type validation
    const nodeKeys = new Set<string>();
    const triggerNodes: string[] = [];

    for (const node of nodes) {
      if (!node.key) {
        errors.push('Node missing required "key" identifier.');
        continue;
      }
      if (nodeKeys.has(node.key)) {
        errors.push(`Duplicate node key detected: "${node.key}". Keys must be unique.`);
      }
      nodeKeys.add(node.key);

      const reg = workflowNodeRegistry.getNode(node.type);
      if (!reg) {
        errors.push(`Unregistered node type "${node.type}" on node "${node.key}".`);
      } else if (reg.category === 'TRIGGERS') {
        triggerNodes.push(node.key);
      }

      // 3. Loop iteration cap validation
      if (node.type === 'LOOP') {
        const maxIter = Number(node.config?.maxIterations) || 10;
        if (maxIter > WORKFLOW_CONFIG.SERVER_ABSOLUTE_MAX_LOOP_ITERATIONS) {
          errors.push(
            `Loop node "${node.key}" exceeds maximum permitted loop iterations (${WORKFLOW_CONFIG.SERVER_ABSOLUTE_MAX_LOOP_ITERATIONS}).`
          );
        }
      }
    }

    if (triggerNodes.length === 0) {
      warnings.push('Workflow has no Trigger node. It can only be executed manually.');
    }

    // 4. Edge validity & Orphan node detection
    const edgeSet = new Set<string>();
    const incomingEdgeCount = new Map<string, number>();
    const outgoingEdgeCount = new Map<string, number>();

    nodeKeys.forEach((k) => {
      incomingEdgeCount.set(k, 0);
      outgoingEdgeCount.set(k, 0);
    });

    for (const edge of edges) {
      if (!nodeKeys.has(edge.source)) {
        errors.push(`Edge references non-existent source node key "${edge.source}".`);
      }
      if (!nodeKeys.has(edge.target)) {
        errors.push(`Edge references non-existent target node key "${edge.target}".`);
      }

      const edgeKey = `${edge.source}->${edge.target}:${edge.condition || ''}`;
      if (edgeSet.has(edgeKey)) {
        errors.push(`Duplicate edge detected between "${edge.source}" and "${edge.target}".`);
      }
      edgeSet.add(edgeKey);

      if (nodeKeys.has(edge.source)) {
        outgoingEdgeCount.set(edge.source, (outgoingEdgeCount.get(edge.source) || 0) + 1);
      }
      if (nodeKeys.has(edge.target)) {
        incomingEdgeCount.set(edge.target, (incomingEdgeCount.get(edge.target) || 0) + 1);
      }
    }

    // Orphan check: Nodes with zero incoming and zero outgoing edges (unless single node workflow)
    if (nodes.length > 1) {
      for (const node of nodes) {
        const isTrigger = triggerNodes.includes(node.key);
        const inc = incomingEdgeCount.get(node.key) || 0;
        const out = outgoingEdgeCount.get(node.key) || 0;

        if (!isTrigger && inc === 0 && out === 0) {
          warnings.push(`Orphan node detected: "${node.key}". Node is disconnected from the workflow graph.`);
        }
      }
    }

    // 5. Cycle Detection (Allow loops ONLY via explicit LOOP nodes)
    const loopNodeKeys = new Set(nodes.filter((n) => n.type === 'LOOP').map((n) => n.key));
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const detectCycles = (currentKey: string): boolean => {
      visited.add(currentKey);
      recStack.add(currentKey);

      const targets = edges.filter((e) => e.source === currentKey).map((e) => e.target);
      for (const t of targets) {
        // If cycle target is not a LOOP node, flag invalid cycle
        if (!visited.has(t)) {
          if (detectCycles(t)) return true;
        } else if (recStack.has(t) && !loopNodeKeys.has(t)) {
          return true;
        }
      }

      recStack.delete(currentKey);
      return false;
    };

    for (const key of Array.from(nodeKeys)) {
      if (!visited.has(key)) {
        if (detectCycles(key)) {
          errors.push('Invalid cyclic loop detected in graph. Cycles are permitted ONLY via explicit LOOP nodes.');
          break;
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

export const graphValidator = new GraphValidator();
