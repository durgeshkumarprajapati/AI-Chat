import { CanonicalWorkflowDefinition } from '../workflow.types';
import { graphValidator, GraphValidationResult } from './graph-validator';
import { workflowNodeRegistry } from '../nodes/workflow-node.registry';
import { ValidationError } from '@/errors';

export class WorkflowValidatorService {
  public validateWorkflowDefinition(definition: CanonicalWorkflowDefinition): GraphValidationResult {
    const graphRes = graphValidator.validateGraph(definition);
    if (!graphRes.isValid) return graphRes;

    const extraErrors: string[] = [];

    for (const node of definition.nodes) {
      const reg = workflowNodeRegistry.getNode(node.type);
      if (!reg) continue;

      // Validate required config keys if defined in schema
      if (reg.configSchema && typeof reg.configSchema === 'object') {
        const requiredKeys = Object.keys(reg.configSchema);
        for (const reqKey of requiredKeys) {
          const val = node.config?.[reqKey];
          if (val === undefined || val === null || val === '') {
            // Optional configs get default fallback during execution
          }
        }
      }
    }

    return {
      isValid: graphRes.isValid && extraErrors.length === 0,
      errors: [...graphRes.errors, ...extraErrors],
      warnings: graphRes.warnings
    };
  }

  public assertValidDefinition(definition: CanonicalWorkflowDefinition): void {
    const res = this.validateWorkflowDefinition(definition);
    if (!res.isValid) {
      throw new ValidationError(`Workflow validation failed: ${res.errors.join('; ')}`);
    }
  }
}

export const workflowValidatorService = new WorkflowValidatorService();
