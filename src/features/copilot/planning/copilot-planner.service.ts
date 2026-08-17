import { CopilotIntent, CopilotPlan, CopilotPlanStep } from '../types/copilot.types';
import { copilotCapabilityRegistry } from '../capabilities/copilot-capability.registry';
import { env } from '@/config/env';

export class CopilotPlannerService {
  /**
   * Generate execution proposal plan based on intent and query.
   */
  public generatePlan(goal: string, intent: CopilotIntent, documentIds?: string[], _sourceMode?: string): CopilotPlan {
    const steps: CopilotPlanStep[] = [];

    switch (intent) {
      case 'DOCUMENT_ANALYSIS':
        steps.push({
          id: 'step-1',
          capability: 'DOCUMENT_RAG',
          purpose: 'Retrieve relevant evidence from uploaded document(s)',
          input: { query: goal, documentIds }
        });
        break;

      case 'WEB_RESEARCH':
        steps.push({
          id: 'step-1',
          capability: 'WEB_SEARCH',
          purpose: 'Fetch recent web articles and documentation',
          input: { query: goal }
        });
        steps.push({
          id: 'step-2',
          capability: 'AGENTIC_RESEARCH',
          purpose: 'Extract and verify key claims',
          input: { topic: goal },
          requiresConfirmation: true
        });
        break;

      case 'ROADMAP':
        if (documentIds && documentIds.length > 0) {
          steps.push({
            id: 'step-1',
            capability: 'DOCUMENT_RAG',
            purpose: 'Extract core concepts from document',
            input: { query: goal, documentIds }
          });
        }
        steps.push({
          id: 'step-2',
          capability: 'ROADMAP',
          purpose: 'Create structured learning roadmap',
          input: { topic: goal },
          requiresConfirmation: true
        });
        break;

      case 'LEARNING':
        steps.push({
          id: 'step-1',
          capability: 'DOCUMENT_RAG',
          purpose: 'Fetch topic references',
          input: { query: goal, documentIds }
        });
        steps.push({
          id: 'step-2',
          capability: 'STUDY',
          purpose: 'Generate study session & practice questions',
          input: { topic: goal },
          requiresConfirmation: true
        });
        break;

      case 'WORKFLOW':
        steps.push({
          id: 'step-1',
          capability: 'WORKFLOW',
          purpose: 'Build and run automated processing workflow',
          input: { prompt: goal },
          requiresConfirmation: true
        });
        break;

      case 'MULTI_STEP':
        steps.push({
          id: 'step-1',
          capability: 'DOCUMENT_RAG',
          purpose: 'Understand reference document content',
          input: { query: goal, documentIds }
        });
        steps.push({
          id: 'step-2',
          capability: 'WEB_SEARCH',
          purpose: 'Search current official documentation and web sources',
          input: { query: goal }
        });
        steps.push({
          id: 'step-3',
          capability: 'ROADMAP',
          purpose: 'Synthesize findings into a learning roadmap',
          input: { topic: goal },
          requiresConfirmation: true
        });
        break;

      default:
        steps.push({
          id: 'step-1',
          capability: 'DOCUMENT_RAG',
          purpose: 'Retrieve document context',
          input: { query: goal, documentIds }
        });
        steps.push({
          id: 'step-2',
          capability: 'CHAT',
          purpose: 'Synthesize answer with citations',
          input: { query: goal }
        });
        break;
    }

    const requiresConfirmation = steps.some((s) => s.requiresConfirmation);

    return {
      goal,
      intent,
      steps,
      requiresConfirmation
    };
  }

  /**
   * Server-side plan validation.
   */
  public validatePlan(plan: CopilotPlan): { isValid: boolean; error?: string } {
    const maxSteps = (env.server as any)?.COPILOT_MAX_PLAN_STEPS || 10;

    if (!plan.steps || plan.steps.length === 0) {
      return { isValid: false, error: 'Plan must contain at least one step' };
    }

    if (plan.steps.length > maxSteps) {
      return { isValid: false, error: `Plan exceeds maximum allowed steps (${maxSteps})` };
    }

    for (const step of plan.steps) {
      const def = copilotCapabilityRegistry.getCapability(step.capability);
      if (!def) {
        return { isValid: false, error: `Unknown capability requested: ${step.capability}` };
      }
    }

    return { isValid: true };
  }
}

export const copilotPlannerService = new CopilotPlannerService();
