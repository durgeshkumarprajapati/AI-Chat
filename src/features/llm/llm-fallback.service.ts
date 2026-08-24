import { LLMProvider } from './llm-provider.interface';
import { LLMRequest, LLMResponse, LLMStreamChunk, StructuredLLMRequest } from './llm.types';
import { LLMModelRegistry, llmModelRegistry } from './llm-model-registry';
import { llmCircuitBreakerService } from './llm-circuit-breaker.service';

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
      { name: 'gemini', isConfigured: () => !!(process.env.GEMINI_API_KEY || process.env.NODE_ENV === 'test') },
      { name: 'deepseek', isConfigured: () => !!process.env.DEEPSEEK_API_KEY },
      { name: 'groq', isConfigured: () => !!process.env.GROQ_API_KEY },
      { name: 'kimi', isConfigured: () => !!process.env.LLM_KIMI_API_KEY },
      {
        name: 'ollama',
        isConfigured: () => {
          if (request.feature === 'CITY_EXPLORER') {
            return process.env.CITY_EXPLORER_ALLOW_OLLAMA_FALLBACK === 'true';
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
   * Executes LLM call with dynamic fallback across prioritized providers.
   */
  public async executeWithFallback(
    primaryProvider: LLMProvider,
    request: LLMRequest,
    modelOverride?: string
  ): Promise<{ response: LLMResponse; usedFallback: boolean }> {
    let currentProvider: LLMProvider | null = primaryProvider;
    let usedFallback = false;
    const attemptedProviders = new Set<string>();
    const req = modelOverride ? { ...request, modelOverride } : request;

    while (currentProvider) {
      attemptedProviders.add(currentProvider.name.toLowerCase());
      try {
        const response = await currentProvider.generate(req);
        llmCircuitBreakerService.recordSuccess(currentProvider.name);
        return { response, usedFallback };
      } catch (err) {
        console.warn(`[LLMFallbackService] Provider "${currentProvider.name}" failed:`, err);
        llmCircuitBreakerService.recordFailure(currentProvider.name, err);

        if (currentProvider.name === 'ollama' || request.localOnly) {
          throw err;
        }

        const nextProvider = this.getNextFallbackProvider(attemptedProviders, request);
        if (!nextProvider) {
          throw err;
        }

        console.warn(`[LLMFallbackService] Falling back from "${currentProvider.name}" to "${nextProvider.name}" provider...`);
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
    const attemptedProviders = new Set<string>();

    while (currentProvider) {
      attemptedProviders.add(currentProvider.name.toLowerCase());
      try {
        for await (const chunk of currentProvider.stream(request)) {
          yield chunk;
        }
        llmCircuitBreakerService.recordSuccess(currentProvider.name);
        return;
      } catch (err) {
        console.warn(`[LLMFallbackService] Stream provider "${currentProvider.name}" failed:`, err);
        llmCircuitBreakerService.recordFailure(currentProvider.name, err);

        if (currentProvider.name === 'ollama' || request.localOnly) {
          throw err;
        }

        currentProvider = this.getNextFallbackProvider(attemptedProviders, request);
        if (!currentProvider) {
          throw err;
        }

        console.warn(`[LLMFallbackService] Streaming falling back to "${currentProvider.name}" provider...`);
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
    const attemptedProviders = new Set<string>();

    while (currentProvider) {
      attemptedProviders.add(currentProvider.name.toLowerCase());
      try {
        const data = await currentProvider.generateStructured(request);
        llmCircuitBreakerService.recordSuccess(currentProvider.name);
        return { data, usedFallback };
      } catch (err) {
        console.warn(`[LLMFallbackService] Structured provider "${currentProvider.name}" failed:`, err);
        llmCircuitBreakerService.recordFailure(currentProvider.name, err);

        if (currentProvider.name === 'ollama' || request.localOnly) {
          throw err;
        }

        currentProvider = this.getNextFallbackProvider(attemptedProviders, request);
        if (!currentProvider) {
          throw err;
        }

        console.warn(`[LLMFallbackService] Structured falling back to "${currentProvider.name}" provider...`);
        usedFallback = true;
      }
    }

    throw new Error('[LLMFallbackService] All available LLM providers failed for structured output.');
  }
}

export const llmFallbackService = new LLMFallbackService();
