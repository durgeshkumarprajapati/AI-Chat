import { LLMRequest, LLMResponse, LLMStreamChunk, StructuredLLMRequest } from './llm.types';
import { LLMProvider } from './llm-provider.interface';
import { llmModelRegistry, LLMModelRegistry } from './llm-model-registry';
import { llmCircuitBreakerService } from './llm-circuit-breaker.service';

export class LLMFallbackService {
  private registry: LLMModelRegistry;

  constructor(registry?: LLMModelRegistry) {
    this.registry = registry || llmModelRegistry;
  }

  private checkCityExplorerOllamaForbidden(request: LLMRequest, candidateProviderName: string): void {
    if (request.feature === 'CITY_EXPLORER') {
      const allowOllama = process.env.CITY_EXPLORER_ALLOW_OLLAMA_FALLBACK === 'true';
      if (candidateProviderName.toLowerCase() === 'ollama' && !allowOllama && !request.localOnly) {
        throw new Error(
          `[LLMFallbackService] Architecture Violation Guard: Ollama fallback is forbidden for CITY_EXPLORER when CITY_EXPLORER_ALLOW_OLLAMA_FALLBACK=false.`
        );
      }
    }
  }

  /**
   * Executes LLM generate call with circuit breaker reporting and fallback if primary provider fails.
   */
  public async executeWithFallback(
    primaryProvider: LLMProvider,
    request: LLMRequest,
    modelOverride?: string
  ): Promise<{ response: LLMResponse; usedFallback: boolean }> {
    const req: LLMRequest = modelOverride ? { ...request, modelOverride } : request;

    try {
      const res = await primaryProvider.generate(req);
      llmCircuitBreakerService.recordSuccess(primaryProvider.name);
      return { response: res, usedFallback: false };
    } catch (err) {
      console.warn(`[LLMFallbackService] Primary provider "${primaryProvider.name}" failed:`, err);
      llmCircuitBreakerService.recordFailure(primaryProvider.name, err);

      if (primaryProvider.name === 'ollama' || request.localOnly) {
        throw err;
      }

      // For CITY_EXPLORER, if Ollama fallback is not allowed, rethrow primary provider error directly
      if (request.feature === 'CITY_EXPLORER' && process.env.CITY_EXPLORER_ALLOW_OLLAMA_FALLBACK !== 'true') {
        throw err;
      }

      // Check if Ollama fallback is disallowed for CITY_EXPLORER
      this.checkCityExplorerOllamaForbidden(request, 'ollama');

      let fallbackProvider = this.registry.getProvider('ollama');

      // If Gemini Reasoning failed, try Kimi if available and configured before Ollama
      if (primaryProvider.name === 'gemini') {
        const kimi = this.registry.getProvider('kimi');
        const isKimiConfigured = !!process.env.LLM_KIMI_API_KEY;
        if (kimi && isKimiConfigured && llmCircuitBreakerService.isAvailable('kimi')) {
          fallbackProvider = kimi;
        }
      }

      if (!fallbackProvider) {
        throw err;
      }

      console.warn(`[LLMFallbackService] Falling back to "${fallbackProvider.name}" provider...`);
      const fallbackRes = await fallbackProvider.generate({ ...req, providerOverride: fallbackProvider.name });
      llmCircuitBreakerService.recordSuccess(fallbackProvider.name);

      return {
        response: {
          ...fallbackRes,
          provider: fallbackProvider.name
        },
        usedFallback: true
      };
    }
  }

  /**
   * Executes streaming LLM call with fallback if primary fails to initialize.
   */
  public async *streamWithFallback(
    primaryProvider: LLMProvider,
    request: LLMRequest
  ): AsyncIterable<LLMStreamChunk> {
    try {
      for await (const chunk of primaryProvider.stream(request)) {
        yield chunk;
      }
      llmCircuitBreakerService.recordSuccess(primaryProvider.name);
    } catch (err) {
      console.warn(`[LLMFallbackService] Primary stream provider "${primaryProvider.name}" failed:`, err);
      llmCircuitBreakerService.recordFailure(primaryProvider.name, err);

      if (primaryProvider.name === 'ollama' || request.localOnly) {
        throw err;
      }

      this.checkCityExplorerOllamaForbidden(request, 'ollama');

      let fallbackProvider = this.registry.getProvider('ollama');
      if (primaryProvider.name === 'gemini') {
        const kimi = this.registry.getProvider('kimi');
        if (kimi && llmCircuitBreakerService.isAvailable('kimi')) {
          fallbackProvider = kimi;
        }
      }

      if (!fallbackProvider) {
        throw err;
      }

      console.warn(`[LLMFallbackService] Streaming falling back to "${fallbackProvider.name}" provider...`);
      for await (const chunk of fallbackProvider.stream({ ...request, providerOverride: fallbackProvider.name })) {
        yield chunk;
      }
      llmCircuitBreakerService.recordSuccess(fallbackProvider.name);
    }
  }

  /**
   * Executes structured LLM call with fallback.
   */
  public async generateStructuredWithFallback<T>(
    primaryProvider: LLMProvider,
    request: StructuredLLMRequest<T>
  ): Promise<{ data: T; usedFallback: boolean }> {
    try {
      const data = await primaryProvider.generateStructured(request);
      llmCircuitBreakerService.recordSuccess(primaryProvider.name);
      return { data, usedFallback: false };
    } catch (err) {
      console.warn(`[LLMFallbackService] Structured primary provider "${primaryProvider.name}" failed:`, err);
      llmCircuitBreakerService.recordFailure(primaryProvider.name, err);

      if (primaryProvider.name === 'ollama' || request.localOnly) {
        throw err;
      }

      this.checkCityExplorerOllamaForbidden(request, 'ollama');

      const fallbackProvider = this.registry.getProvider('ollama');
      if (!fallbackProvider) {
        throw err;
      }

      const data = await fallbackProvider.generateStructured({ ...request, providerOverride: 'ollama' });
      llmCircuitBreakerService.recordSuccess(fallbackProvider.name);
      return { data, usedFallback: true };
    }
  }
}

export const llmFallbackService = new LLMFallbackService();
