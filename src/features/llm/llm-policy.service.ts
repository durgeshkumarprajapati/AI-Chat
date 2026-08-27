import { FeatureScope, ComplexityLevel, RoutingDecision, LLMRequest } from './llm.types';
import { env } from '@/config/env';
import { llmCircuitBreakerService } from '@/features/llm/llm-circuit-breaker.service';
import { resolveModelForProvider } from './utils/model-validator';

export class LLMPolicyService {
  /**
   * Hard runtime guard ensuring Ollama is never used for CITY_EXPLORER when disallowed.
   */
  public assertCityExplorerProviderAllowed(providerName: string, request: LLMRequest): void {
    if (request.feature === 'CITY_EXPLORER') {
      const allowOllamaEnv = process.env.CITY_EXPLORER_ALLOW_OLLAMA_FALLBACK;
      const allowOllama = allowOllamaEnv !== undefined ? allowOllamaEnv === 'true' : (env.server?.CITY_EXPLORER_ALLOW_OLLAMA_FALLBACK ?? false);
      if (providerName.toLowerCase() === 'ollama' && !allowOllama && !request.localOnly) {
        throw new Error(
          `[LLMPolicyService] Architecture Violation: Ollama provider is forbidden for CITY_EXPLORER when CITY_EXPLORER_ALLOW_OLLAMA_FALLBACK=false.`
        );
      }
    }
  }

  /**
   * Resolves provider and model routing decision according to feature policy, request complexity, and circuit state.
   */
  public selectRoute(request: LLMRequest, complexity: ComplexityLevel): RoutingDecision {
    const isGeminiEnabled =
      (env.server?.GEMINI_ENABLED ?? (process.env.GEMINI_ENABLED !== 'false')) &&
      !!(env.server?.GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.NODE_ENV === 'test');
    const isDeepSeekEnabled =
      (env.server?.DEEPSEEK_ENABLED ?? (process.env.DEEPSEEK_ENABLED !== 'false')) &&
      !!(env.server?.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.NODE_ENV === 'test');
    const isGroqEnabled =
      (env.server?.GROQ_ENABLED ?? (process.env.GROQ_ENABLED !== 'false')) &&
      !!(env.server?.GROQ_API_KEY || process.env.GROQ_API_KEY || process.env.NODE_ENV === 'test');
    const isKimiEnabled =
      (env.server?.LLM_KIMI_ENABLED ?? (process.env.LLM_KIMI_ENABLED === 'true')) &&
      !!(env.server?.LLM_KIMI_API_KEY || process.env.LLM_KIMI_API_KEY);

    const isGeminiAvailable = isGeminiEnabled && llmCircuitBreakerService.isAvailable('gemini');
    const isDeepSeekAvailable = isDeepSeekEnabled && llmCircuitBreakerService.isAvailable('deepseek');
    const isGroqAvailable = isGroqEnabled && llmCircuitBreakerService.isAvailable('groq');
    const isKimiAvailable = isKimiEnabled && llmCircuitBreakerService.isAvailable('kimi');
    const isOllamaAvailable = llmCircuitBreakerService.isAvailable('ollama');

    const geminiFastModel = env.server?.GEMINI_FAST_MODEL || process.env.GEMINI_FAST_MODEL || 'gemini-2.5-flash';
    const geminiReasoningModel = env.server?.GEMINI_REASONING_MODEL || process.env.GEMINI_REASONING_MODEL || 'gemini-2.5-pro';
    const deepseekDefaultModel = env.server?.DEEPSEEK_DEFAULT_MODEL || process.env.DEEPSEEK_DEFAULT_MODEL || 'deepseek-v4-flash';
    const deepseekReasoningModel = env.server?.DEEPSEEK_REASONING_MODEL || process.env.DEEPSEEK_REASONING_MODEL || 'deepseek-reasoner';
    const groqDefaultModel = env.server?.GROQ_DEFAULT_MODEL || process.env.GROQ_DEFAULT_MODEL || 'llama-3.3-70b-versatile';
    const groqReasoningModel = env.server?.GROQ_REASONING_MODEL || process.env.GROQ_REASONING_MODEL || 'deepseek-r1-distill-llama-70b';
    const ollamaFastModel = env.server?.LLM_OLLAMA_FAST_MODEL || 'llama3.2';
    const ollamaChatModel = env.server?.OLLAMA_CHAT_MODEL || 'llama3.2';
    const kimiModel = env.server?.LLM_KIMI_DEFAULT_MODEL || 'kimi-k3';

    const feature: FeatureScope = request.feature || 'GENERAL';

    // 1. Explicit Feature Policy for CITY_EXPLORER (Highest Precedence)
    if (feature === 'CITY_EXPLORER') {
      if (isGeminiAvailable) {
        return {
          providerName: 'gemini',
          modelName: resolveModelForProvider('gemini', request.modelOverride, geminiFastModel),
          complexity,
          reason: 'Explicit feature policy for CITY_EXPLORER routed to Gemini Fast'
        };
      }

      if (isDeepSeekAvailable) {
        return {
          providerName: 'deepseek',
          modelName: resolveModelForProvider('deepseek', request.modelOverride, deepseekDefaultModel),
          complexity,
          reason: 'CITY_EXPLORER fallback routed to DeepSeek'
        };
      }

      if (isGroqAvailable) {
        return {
          providerName: 'groq',
          modelName: resolveModelForProvider('groq', request.modelOverride, groqDefaultModel),
          complexity,
          reason: 'CITY_EXPLORER fallback routed to Groq'
        };
      }

      const allowOllama = env.server?.CITY_EXPLORER_ALLOW_OLLAMA_FALLBACK ?? (process.env.CITY_EXPLORER_ALLOW_OLLAMA_FALLBACK === 'true');
      if (!allowOllama && !request.localOnly) {
        if (isKimiAvailable) {
          return {
            providerName: 'kimi',
            modelName: resolveModelForProvider('kimi', request.modelOverride, kimiModel),
            complexity,
            reason: 'CITY_EXPLORER fallback to Kimi (Ollama fallback disabled)'
          };
        }
        // If Gemini and Kimi are unavailable, return Gemini decision so gateway falls back to WebSearch, NOT Ollama
        return {
          providerName: 'gemini',
          modelName: resolveModelForProvider('gemini', request.modelOverride, geminiFastModel),
          complexity,
          reason: 'Explicit feature policy for CITY_EXPLORER requiring Gemini'
        };
      }
    }

    // 2. Explicit Overrides & Local-Only Constraints (ZERO CLOUD LEAKAGE)
    if (request.localOnly || (!isGeminiAvailable && !isDeepSeekAvailable && !isGroqAvailable && !isKimiAvailable && isOllamaAvailable)) {
      this.assertCityExplorerProviderAllowed('ollama', request);
      const defaultOllamaModel = complexity === 'LOW' ? ollamaFastModel : ollamaChatModel;
      return {
        providerName: 'ollama',
        modelName: resolveModelForProvider('ollama', request.modelOverride, defaultOllamaModel),
        complexity,
        reason: request.localOnly ? 'Enforced LOCAL_ONLY policy' : 'Local Ollama model selected'
      };
    }

    if (request.providerOverride) {
      const pName = request.providerOverride.toLowerCase();
      this.assertCityExplorerProviderAllowed(pName, request);
      if (pName === 'gemini' && isGeminiAvailable) {
        const fallbackGeminiModel = complexity === 'HIGH' ? geminiReasoningModel : geminiFastModel;
        return {
          providerName: 'gemini',
          modelName: resolveModelForProvider('gemini', request.modelOverride, fallbackGeminiModel),
          complexity,
          reason: 'Explicit provider override to Gemini'
        };
      }
      if (pName === 'deepseek' && isDeepSeekAvailable) {
        const fallbackDeepSeekModel = complexity === 'HIGH' ? deepseekReasoningModel : deepseekDefaultModel;
        return {
          providerName: 'deepseek',
          modelName: resolveModelForProvider('deepseek', request.modelOverride, fallbackDeepSeekModel),
          complexity,
          reason: 'Explicit provider override to DeepSeek'
        };
      }
      if (pName === 'groq' && isGroqAvailable) {
        const fallbackGroqModel = complexity === 'HIGH' ? groqReasoningModel : groqDefaultModel;
        return {
          providerName: 'groq',
          modelName: resolveModelForProvider('groq', request.modelOverride, fallbackGroqModel),
          complexity,
          reason: 'Explicit provider override to Groq'
        };
      }
      if (pName === 'kimi' && isKimiAvailable) {
        return {
          providerName: 'kimi',
          modelName: resolveModelForProvider('kimi', request.modelOverride, kimiModel),
          complexity,
          reason: 'Explicit provider override to Kimi'
        };
      }
      return {
        providerName: 'ollama',
        modelName: resolveModelForProvider('ollama', request.modelOverride, ollamaChatModel),
        complexity,
        reason: 'Explicit provider override to Ollama'
      };
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
    this.assertCityExplorerProviderAllowed('ollama', request);
    return {
      providerName: 'ollama',
      modelName: complexity === 'LOW' ? ollamaFastModel : ollamaChatModel,
      complexity,
      reason: `Standard request for ${feature} routed to fast Ollama provider`
    };
  }
}

export const llmPolicyService = new LLMPolicyService();
