import { configService } from '@/features/config/config.service';
import { AUTOMATION_NODE_REGISTRY } from './nodes/automation-node.registry';
import { AutomationDefinition, AutomationValidationResult } from './automation.types';

/**
 * Phase 88 — validates a whole `AutomationDefinition` graph against the closed node registry.
 * Used both when creating/publishing a version (automation.service.ts) and when flipping an
 * automation's status to ACTIVE (which must re-validate the CURRENT version's definition).
 *
 * Deliberately conservative and bounded: caps total node count via WORKFLOW_MAX_NODES, requires
 * exactly one TRIGGER node, requires every node type to exist in AUTOMATION_NODE_REGISTRY, checks
 * every edge references real node keys, and per-node-type config via each registry entry's own
 * validate().
 */
export class AutomationDefinitionValidatorService {
  public async validate(definition: unknown): Promise<AutomationValidationResult> {
    const errors: string[] = [];

    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
      return { valid: false, errors: ['definition must be an object with "nodes" and "edges" arrays'] };
    }

    const def = definition as Partial<AutomationDefinition>;
    if (!Array.isArray(def.nodes) || def.nodes.length === 0) {
      return { valid: false, errors: ['definition.nodes must be a non-empty array'] };
    }
    if (!Array.isArray(def.edges)) {
      return { valid: false, errors: ['definition.edges must be an array'] };
    }

    const maxNodes = await configService.getNumber('WORKFLOW_MAX_NODES', 25);
    if (def.nodes.length > maxNodes) {
      errors.push(`definition.nodes exceeds the maximum of ${maxNodes} nodes (WORKFLOW_MAX_NODES).`);
    }

    const seenKeys = new Set<string>();
    let triggerCount = 0;
    for (const node of def.nodes) {
      if (!node || typeof node !== 'object' || typeof node.key !== 'string' || !node.key.trim()) {
        errors.push('Every node requires a non-empty string "key".');
        continue;
      }
      if (seenKeys.has(node.key)) {
        errors.push(`Duplicate node key "${node.key}".`);
      }
      seenKeys.add(node.key);

      const nodeDef = AUTOMATION_NODE_REGISTRY[node.type as keyof typeof AUTOMATION_NODE_REGISTRY];
      if (!nodeDef) {
        errors.push(`Node "${node.key}" references an unregistered node type "${String(node.type)}".`);
        continue;
      }
      if (node.type === 'TRIGGER') triggerCount += 1;

      const configResult = nodeDef.validate(node.config ?? {});
      if (!configResult.valid) {
        for (const e of configResult.errors || ['invalid config']) {
          errors.push(`Node "${node.key}" (${node.type}): ${e}`);
        }
      }
    }

    if (triggerCount !== 1) {
      errors.push(`definition must contain exactly one TRIGGER node (found ${triggerCount}).`);
    }

    for (const edge of def.edges) {
      if (!edge || typeof edge !== 'object' || typeof edge.from !== 'string' || typeof edge.to !== 'string') {
        errors.push('Every edge requires string "from" and "to" node keys.');
        continue;
      }
      if (!seenKeys.has(edge.from)) errors.push(`Edge references unknown source node "${edge.from}".`);
      if (!seenKeys.has(edge.to)) errors.push(`Edge references unknown target node "${edge.to}".`);
    }

    return { valid: errors.length === 0, errors };
  }
}

export const automationDefinitionValidatorService = new AutomationDefinitionValidatorService();
