import { LLMProvider } from './llm-provider.interface';
import { LLMRequest, LLMResponse, LLMStreamChunk, StructuredLLMRequest } from './llm.types';
import { LLMModelRegistry, llmModelRegistry } from './llm-model-registry';
import { llmCircuitBreakerService } from './llm-circuit-breaker.service';
import { isModelValidForProvider } from './utils/model-validator';
import { classifyLLMError } from './llm-error.classifier';
import { llmTelemetryService } from './llm-telemetry.service';
import { env } from '@/config/env';

export class LLMFallbackService {
  private registry: LLMModelRegistry;

  constructor(registry: LLMModelRegistry = llmModelRegistry) {
    this.registry = registry;
  }

  /**
   * Resolves the next candidate fallback provider based on configured priority and availability.
   * Priority: Gemini (1) -> DeepSeek (2) -> Groq (3) -> Kimi (4) -> Ollama (5)
   */
  private getNextFallbackProvider(attempted: Set<string>, request: LLMRequest): LLMProvider | null {
    const candidates: { name: string; isConfigured: () => boolean }[] = [
      {
        name: 'gemini',
        isConfigured: () => {
          const enabledEnv = process.env.GEMINI_ENABLED;
          const isEnabled = enabledEnv !== undefined ? enabledEnv !== 'false' : (env.server?.GEMINI_ENABLED ?? true);
          const key = process.env.GEMINI_API_KEY;
          const hasKey = key !== undefined ? key !== '' : !!(env.server?.GEMINI_API_KEY || (process.env.NODE_ENV === 'test' && env.server?.GEMINI_API_KEY !== ''));
          return isEnabled && hasKey;
        }
      },
      {
        name: 'deepseek',
        isConfigured: () => {
          const enabledEnv = process.env.DEEPSEEK_ENABLED;
          const isEnabled = enabledEnv !== undefined ? enabledEnv !== 'false' : (env.server?.DEEPSEEK_ENABLED ?? true);
          const key = process.env.DEEPSEEK_API_KEY;
          const hasKey = key !== undefined ? key !== '' : !!env.server?.DEEPSEEK_API_KEY;
          return isEnabled && hasKey;
        }
      },
      {
        name: 'groq',
        isConfigured: () => {
          const enabledEnv = process.env.GROQ_ENABLED;
          const isEnabled = enabledEnv !== undefined ? enabledEnv !== 'false' : (env.server?.GROQ_ENABLED ?? true);
          const key = process.env.GROQ_API_KEY;
          const hasKey = key !== undefined ? key !== '' : !!env.server?.GROQ_API_KEY;
          return isEnabled && hasKey;
        }
      },
      {
        name: 'kimi',
        isConfigured: () => {
          const enabledEnv = process.env.LLM_KIMI_ENABLED;
          const isEnabled = enabledEnv !== undefined ? enabledEnv === 'true' : (env.server?.LLM_KIMI_ENABLED ?? false);
          const key = process.env.LLM_KIMI_API_KEY;
          const hasKey = key !== undefined ? key !== '' : !!env.server?.LLM_KIMI_API_KEY;
          return isEnabled && hasKey;
        }
      },
      {
        name: 'ollama',
        isConfigured: () => {
          if (request.feature === 'CITY_EXPLORER') {
            const allowOllamaEnv = process.env.CITY_EXPLORER_ALLOW_OLLAMA_FALLBACK;
            return allowOllamaEnv !== undefined ? allowOllamaEnv === 'true' : (env.server?.CITY_EXPLORER_ALLOW_OLLAMA_FALLBACK ?? false);
          }
          return true;
        }
      }
    ];

    for (const candidate of candidates) {
      if (!attempted.has(candidate.name) && candidate.isConfigured()) {
        const provider = this.registry.getProvider(candidate.name);
        if (provider && llmCircuitBreakerService.isAvailable(candidate.name)) {
          return provider;
        }
      }
    }

    return null;
  }

  /**
   * Helper to ensure request model override is stripped if incompatible with candidate fallback provider
   * or if fallback is active.
   */
  private sanitizeRequestForProvider<T extends LLMRequest>(providerName: string, request: T, usedFallback: boolean): T {
    if (!request.modelOverride) {
      return request;
    }
    if (!isModelValidForProvider(providerName, request.modelOverride) || usedFallback) {
      const { modelOverride: _modelOverride, ...cleaned } = request;
      return cleaned as T;
    }
    return request;
  }

  /**
   * Executes LLM call with dynamic fallback across prioritized providers.
   */
  public async executeWithFallback(
    primaryProvider: LLMProvider,
    request: LLMRequest,
    modelOverride?: string
  ): Promise<{ response: LLMResponse; usedFallback: boolean }> {
    let currentProvider: LLMProvider | null = primaryProvider;
    let usedFallback = false;
    let attemptIndex = 1;
    const attemptedProviders = new Set<string>();
    let currentReq: LLMRequest = modelOverride ? { ...request, modelOverride } : request;

    while (currentProvider) {
      attemptedProviders.add(currentProvider.name.toLowerCase());
      const activeReq = this.sanitizeRequestForProvider(currentProvider.name, currentReq, usedFallback);

      try {
        console.log(`[LLMFallbackService] Attempt ${attemptIndex}: provider=${currentProvider.name} feature=${activeReq.feature || 'GENERAL'}`);
        llmTelemetryService.recordLifecycleEvent('llm.provider.request.started', {
          provider: currentProvider.name,
          model: activeReq.modelOverride,
          feature: activeReq.feature,
          attempt: attemptIndex
        });

        const response = await currentProvider.generate(activeReq);
        llmCircuitBreakerService.recordSuccess(currentProvider.name);

        if (usedFallback) {
          llmTelemetryService.recordLifecycleEvent('llm.provider.fallback.succeeded', {
            provider: response.provider,
            model: response.model,
            feature: activeReq.feature,
            attempt: attemptIndex
          });
        }

        return { response, usedFallback };
      } catch (err) {
        const classified = classifyLLMError(err, currentProvider.name);
        console.warn(
          `[LLMFallbackService] Attempt ${attemptIndex} failed for provider "${currentProvider.name}" [category=${classified.category}]:`,
          err instanceof Error ? err.message : String(err)
        );

        llmCircuitBreakerService.recordFailure(currentProvider.name, err);

        llmTelemetryService.recordLifecycleEvent('llm.provider.request.failed', {
          provider: currentProvider.name,
          model: activeReq.modelOverride,
          feature: activeReq.feature,
          attempt: attemptIndex,
          errorCategory: classified.category,
          error: classified.message
        });

        if (classified.category === 'MODEL_NOT_FOUND' || classified.category === 'INVALID_MODEL') {
          llmTelemetryService.recordLifecycleEvent('llm.provider.model.not_found', {
            provider: currentProvider.name,
            model: activeReq.modelOverride,
            feature: activeReq.feature,
            attempt: attemptIndex,
            errorCategory: classified.category,
            error: classified.message
          });
        }

        if (currentProvider.name === 'ollama' || request.localOnly) {
          throw err;
        }

        const nextProvider = this.getNextFallbackProvider(attemptedProviders, request);
        if (!nextProvider) {
          llmTelemetryService.recordLifecycleEvent('llm.provider.fallback.exhausted', {
            provider: currentProvider.name,
            feature: request.feature,
            attempt: attemptIndex,
            errorCategory: classified.category,
            error: classified.message
          });
          throw err;
        }

        attemptIndex++;
        console.warn(`[LLMFallbackService] Falling back from "${currentProvider.name}" to "${nextProvider.name}" provider (Attempt ${attemptIndex})...`);

        llmTelemetryService.recordLifecycleEvent('llm.provider.fallback.started', {
          provider: nextProvider.name,
          feature: request.feature,
          attempt: attemptIndex
        });

        currentProvider = nextProvider;
        usedFallback = true;
      }
    }

    throw new Error('[LLMFallbackService] All available LLM providers failed.');
  }

  /**
   * Executes streaming LLM call with fallback if primary or intermediate provider fails.
   */
  public async *streamWithFallback(
    primaryProvider: LLMProvider,
    request: LLMRequest
  ): AsyncIterable<LLMStreamChunk> {
    let currentProvider: LLMProvider | null = primaryProvider;
    let usedFallback = false;
    let attemptIndex = 1;
    const attemptedProviders = new Set<string>();

    while (currentProvider) {
      attemptedProviders.add(currentProvider.name.toLowerCase());
      const activeReq = this.sanitizeRequestForProvider(currentProvider.name, request, usedFallback);

      try {
        console.log(`[LLMFallbackService] Streaming Attempt ${attemptIndex}: provider=${currentProvider.name} feature=${activeReq.feature || 'GENERAL'}`);
        llmTelemetryService.recordLifecycleEvent('llm.provider.request.started', {
          provider: currentProvider.name,
          model: activeReq.modelOverride,
          feature: activeReq.feature,
          attempt: attemptIndex
        });

        for await (const chunk of currentProvider.stream(activeReq)) {
          yield chunk;
        }

        llmCircuitBreakerService.recordSuccess(currentProvider.name);
        if (usedFallback) {
          llmTelemetryService.recordLifecycleEvent('llm.provider.fallback.succeeded', {
            provider: currentProvider.name,
            feature: activeReq.feature,
            attempt: attemptIndex
          });
        }
        return;
      } catch (err) {
        const classified = classifyLLMError(err, currentProvider.name);
        console.warn(`[LLMFallbackService] Streaming Attempt ${attemptIndex} failed for provider "${currentProvider.name}" [category=${classified.category}]:`, err instanceof Error ? err.message : String(err));
        llmCircuitBreakerService.recordFailure(currentProvider.name, err);

        llmTelemetryService.recordLifecycleEvent('llm.provider.request.failed', {
          provider: currentProvider.name,
          model: activeReq.modelOverride,
          feature: activeReq.feature,
          attempt: attemptIndex,
          errorCategory: classified.category,
          error: classified.message
        });

        if (classified.category === 'MODEL_NOT_FOUND' || classified.category === 'INVALID_MODEL') {
          llmTelemetryService.recordLifecycleEvent('llm.provider.model.not_found', {
            provider: currentProvider.name,
            model: activeReq.modelOverride,
            feature: activeReq.feature,
            attempt: attemptIndex,
            errorCategory: classified.category,
            error: classified.message
          });
        }

        if (currentProvider.name === 'ollama' || request.localOnly) {
          throw err;
        }

        currentProvider = this.getNextFallbackProvider(attemptedProviders, request);
        if (!currentProvider) {
          llmTelemetryService.recordLifecycleEvent('llm.provider.fallback.exhausted', {
            provider: currentProvider.name,
            feature: request.feature,
            attempt: attemptIndex,
            errorCategory: classified.category,
            error: classified.message
          });
          throw err;
        }

        attemptIndex++;
        usedFallback = true;
        console.warn(`[LLMFallbackService] Streaming falling back to "${currentProvider.name}" provider (Attempt ${attemptIndex})...`);
        llmTelemetryService.recordLifecycleEvent('llm.provider.fallback.started', {
          provider: currentProvider.name,
          feature: request.feature,
          attempt: attemptIndex
        });
      }
    }
  }

  /**
   * Executes structured LLM call with fallback across prioritized providers.
   */
  public async generateStructuredWithFallback<T>(
    primaryProvider: LLMProvider,
    request: StructuredLLMRequest<T>
  ): Promise<{ data: T; usedFallback: boolean }> {
    let currentProvider: LLMProvider | null = primaryProvider;
    let usedFallback = false;
    let attemptIndex = 1;
    const attemptedProviders = new Set<string>();

    while (currentProvider) {
      attemptedProviders.add(currentProvider.name.toLowerCase());
      const activeReq = this.sanitizeRequestForProvider(currentProvider.name, request, usedFallback);

      try {
        console.log(`[LLMFallbackService] Structured Attempt ${attemptIndex}: provider=${currentProvider.name} feature=${activeReq.feature || 'GENERAL'}`);
        llmTelemetryService.recordLifecycleEvent('llm.provider.request.started', {
          provider: currentProvider.name,
          model: activeReq.modelOverride,
          feature: activeReq.feature,
          attempt: attemptIndex
        });

        const data = await currentProvider.generateStructured(activeReq);
        llmCircuitBreakerService.recordSuccess(currentProvider.name);

        if (usedFallback) {
          llmTelemetryService.recordLifecycleEvent('llm.provider.fallback.succeeded', {
            provider: currentProvider.name,
            feature: activeReq.feature,
            attempt: attemptIndex
          });
        }
        return { data, usedFallback };
      } catch (err) {
        const classified = classifyLLMError(err, currentProvider.name);
        console.warn(`[LLMFallbackService] Structured Attempt ${attemptIndex} failed for provider "${currentProvider.name}" [category=${classified.category}]:`, err instanceof Error ? err.message : String(err));
        llmCircuitBreakerService.recordFailure(currentProvider.name, err);

        llmTelemetryService.recordLifecycleEvent('llm.provider.request.failed', {
          provider: currentProvider.name,
          model: activeReq.modelOverride,
          feature: activeReq.feature,
          attempt: attemptIndex,
          errorCategory: classified.category,
          error: classified.message
        });

        if (classified.category === 'MODEL_NOT_FOUND' || classified.category === 'INVALID_MODEL') {
          llmTelemetryService.recordLifecycleEvent('llm.provider.model.not_found', {
            provider: currentProvider.name,
            model: activeReq.modelOverride,
            feature: activeReq.feature,
            attempt: attemptIndex,
            errorCategory: classified.category,
            error: classified.message
          });
        }

        if (currentProvider.name === 'ollama' || request.localOnly) {
          throw err;
        }

        currentProvider = this.getNextFallbackProvider(attemptedProviders, request);
        if (!currentProvider) {
          llmTelemetryService.recordLifecycleEvent('llm.provider.fallback.exhausted', {
            provider: currentProvider.name,
            feature: request.feature,
            attempt: attemptIndex,
            errorCategory: classified.category,
            error: classified.message
          });
          throw err;
        }

        attemptIndex++;
        usedFallback = true;
        console.warn(`[LLMFallbackService] Structured falling back to "${currentProvider.name}" provider (Attempt ${attemptIndex})...`);
        llmTelemetryService.recordLifecycleEvent('llm.provider.fallback.started', {
          provider: currentProvider.name,
          feature: request.feature,
          attempt: attemptIndex
        });
      }
    }

    throw new Error('[LLMFallbackService] All available LLM providers failed for structured output.');
  }
}

export const llmFallbackService = new LLMFallbackService();
