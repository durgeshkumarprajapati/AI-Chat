import { FeatureScope, ComplexityLevel, RoutingDecision, LLMRequest } from './llm.types';
import { env } from '@/config/env';
import { llmCircuitBreakerService } from './llm-circuit-breaker.service';

export class LLMPolicyService {
  /**
   * Resolves provider and model routing decision according to feature policy, request complexity, and circuit state.
   */
  public selectRoute(request: LLMRequest, complexity: ComplexityLevel): RoutingDecision {
    const isKimiEnabled = env.server?.LLM_KIMI_ENABLED ?? (process.env.LLM_KIMI_ENABLED === 'true');
    const isKimiAvailable = isKimiEnabled && llmCircuitBreakerService.isAvailable('kimi');
    const isOllamaAvailable = llmCircuitBreakerService.isAvailable('ollama');

    // 1. Explicit Overrides & Local-Only Constraints
    if (request.localOnly || (!isKimiAvailable && isOllamaAvailable)) {
      return {
        providerName: 'ollama',
        modelName: request.modelOverride || (complexity === 'LOW' ? (env.server?.LLM_OLLAMA_FAST_MODEL || 'llama3.2') : (env.server?.OLLAMA_CHAT_MODEL || 'llama3.2')),
        complexity,
        reason: request.localOnly ? 'Enforced LOCAL_ONLY policy' : 'Local Ollama model selected'
      };
    }

    if (request.providerOverride) {
      const pName = request.providerOverride.toLowerCase();
      if (pName === 'kimi' && isKimiAvailable) {
        return {
          providerName: 'kimi',
          modelName: request.modelOverride || (env.server?.LLM_KIMI_DEFAULT_MODEL || 'kimi-k3'),
          complexity,
          reason: 'Explicit provider override to Kimi'
        };
      }
      return {
        providerName: 'ollama',
        modelName: request.modelOverride || (env.server?.OLLAMA_CHAT_MODEL || 'llama3.2'),
        complexity,
        reason: 'Explicit provider override to Ollama'
      };
    }

    const feature: FeatureScope = request.feature || 'GENERAL';

    // 2. Feature-based High Complexity Routing
    if (isKimiAvailable && (complexity === 'HIGH' || feature === 'AGENTIC_RESEARCH' || feature === 'WORKFLOW_GENERATION')) {
      return {
        providerName: 'kimi',
        modelName: env.server?.LLM_KIMI_DEFAULT_MODEL || 'kimi-k3',
        complexity,
        reason: `High complexity request for ${feature} routed to Kimi K3`
      };
    }

    if (isKimiAvailable && feature === 'COPILOT' && complexity !== 'LOW') {
      return {
        providerName: 'kimi',
        modelName: env.server?.LLM_KIMI_DEFAULT_MODEL || 'kimi-k3',
        complexity,
        reason: 'Copilot medium/high complexity request routed to Kimi'
      };
    }

    // 3. Fast Path Default (Ollama)
    return {
      providerName: 'ollama',
      modelName: complexity === 'LOW' ? (env.server?.LLM_OLLAMA_FAST_MODEL || 'llama3.2') : (env.server?.OLLAMA_CHAT_MODEL || 'llama3.2'),
      complexity,
      reason: `Standard request for ${feature} routed to fast Ollama provider`
    };
  }
}

export const llmPolicyService = new LLMPolicyService();
