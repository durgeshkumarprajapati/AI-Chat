import { FeatureScope, ComplexityLevel, RoutingDecision, LLMRequest } from './llm.types';
import { env } from '@/config/env';
import { llmCircuitBreakerService } from './llm-circuit-breaker.service';

export class LLMPolicyService {
  /**
   * Resolves provider and model routing decision according to feature policy, request complexity, and circuit state.
   */
  public selectRoute(request: LLMRequest, complexity: ComplexityLevel): RoutingDecision {
    const isGeminiEnabled =
      (env.server?.GEMINI_ENABLED ?? (process.env.GEMINI_ENABLED !== 'false')) &&
      !!(env.server?.GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.NODE_ENV === 'test');
    const isKimiEnabled = (env.server?.LLM_KIMI_ENABLED ?? (process.env.LLM_KIMI_ENABLED === 'true')) &&
      !!(env.server?.LLM_KIMI_API_KEY || process.env.LLM_KIMI_API_KEY);

    const isGeminiAvailable = isGeminiEnabled && llmCircuitBreakerService.isAvailable('gemini');
    const isKimiAvailable = isKimiEnabled && llmCircuitBreakerService.isAvailable('kimi');
    const isOllamaAvailable = llmCircuitBreakerService.isAvailable('ollama');

    const geminiFastModel = env.server?.GEMINI_FAST_MODEL || process.env.GEMINI_FAST_MODEL || 'gemini-2.5-flash';
    const geminiReasoningModel = env.server?.GEMINI_REASONING_MODEL || process.env.GEMINI_REASONING_MODEL || 'gemini-2.5-pro';
    const ollamaFastModel = env.server?.LLM_OLLAMA_FAST_MODEL || 'llama3.2';
    const ollamaChatModel = env.server?.OLLAMA_CHAT_MODEL || 'llama3.2';
    const kimiModel = env.server?.LLM_KIMI_DEFAULT_MODEL || 'kimi-k3';

    // 1. Explicit Overrides & Local-Only Constraints (ZERO CLOUD LEAKAGE)
    if (request.localOnly || (!isGeminiAvailable && !isKimiAvailable && isOllamaAvailable)) {
      return {
        providerName: 'ollama',
        modelName: request.modelOverride || (complexity === 'LOW' ? ollamaFastModel : ollamaChatModel),
        complexity,
        reason: request.localOnly ? 'Enforced LOCAL_ONLY policy' : 'Local Ollama model selected'
      };
    }

    if (request.providerOverride) {
      const pName = request.providerOverride.toLowerCase();
      if (pName === 'gemini' && isGeminiAvailable) {
        return {
          providerName: 'gemini',
          modelName: request.modelOverride || (complexity === 'HIGH' ? geminiReasoningModel : geminiFastModel),
          complexity,
          reason: 'Explicit provider override to Gemini'
        };
      }
      if (pName === 'kimi' && isKimiAvailable) {
        return {
          providerName: 'kimi',
          modelName: request.modelOverride || kimiModel,
          complexity,
          reason: 'Explicit provider override to Kimi'
        };
      }
      return {
        providerName: 'ollama',
        modelName: request.modelOverride || ollamaChatModel,
        complexity,
        reason: 'Explicit provider override to Ollama'
      };
    }

    const feature: FeatureScope = request.feature || 'GENERAL';

    // 2. Explicit Feature Policy: CITY_EXPLORER (Gemini Fast Model Precedence)
    if (feature === 'CITY_EXPLORER') {
      if (isGeminiAvailable) {
        return {
          providerName: 'gemini',
          modelName: request.modelOverride || geminiFastModel,
          complexity,
          reason: 'Explicit feature policy for CITY_EXPLORER routed to Gemini Fast'
        };
      }

      const allowOllama = env.server?.CITY_EXPLORER_ALLOW_OLLAMA_FALLBACK ?? false;
      if (!allowOllama && !request.localOnly) {
        // Disallow silent fallback to Ollama for City Explorer queries when disallowed
        if (isKimiAvailable) {
          return {
            providerName: 'kimi',
            modelName: kimiModel,
            complexity,
            reason: 'CITY_EXPLORER fallback to Kimi (Ollama fallback disabled)'
          };
        }
      }
    }

    // 3. High Reasoning & Complex Workloads (Gemini Reasoning or Kimi)
    if (complexity === 'HIGH' || feature === 'WORKFLOW_GENERATION' || feature === 'AGENTIC_RESEARCH') {
      if (isGeminiAvailable) {
        return {
          providerName: 'gemini',
          modelName: geminiReasoningModel,
          complexity,
          reason: `High complexity request for ${feature} routed to Gemini Reasoning`
        };
      }
      if (isKimiAvailable) {
        return {
          providerName: 'kimi',
          modelName: kimiModel,
          complexity,
          reason: `High complexity request for ${feature} routed to Kimi K3`
        };
      }
    }

    // 4. Medium Complexity & Specific Features (Gemini Fast)
    if (isGeminiAvailable && complexity !== 'LOW') {
      if (
        feature === 'ROADMAP' ||
        feature === 'STUDY' ||
        feature === 'COPILOT' ||
        feature === 'MULTIMODAL' ||
        feature === 'RAG_CHAT' ||
        complexity === 'MEDIUM'
      ) {
        return {
          providerName: 'gemini',
          modelName: geminiFastModel,
          complexity,
          reason: `Request for ${feature} routed to Gemini Fast`
        };
      }
    }

    // 5. Fallback Default (Ollama)
    return {
      providerName: 'ollama',
      modelName: complexity === 'LOW' ? ollamaFastModel : ollamaChatModel,
      complexity,
      reason: `Standard request for ${feature} routed to fast Ollama provider`
    };
  }
}

export const llmPolicyService = new LLMPolicyService();
