import { LLMRequest, LLMResponse, LLMStreamChunk, StructuredLLMRequest } from './llm.types';
import { LLMProvider } from './llm-provider.interface';
import { llmModelRegistry, LLMModelRegistry } from './llm-model-registry';
import { llmCircuitBreakerService } from './llm-circuit-breaker.service';

export class LLMFallbackService {
  private registry: LLMModelRegistry;

  constructor(registry?: LLMModelRegistry) {
    this.registry = registry || llmModelRegistry;
  }

  /**
   * Executes LLM generate call with circuit breaker reporting and fallback to Ollama if primary provider fails.
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
      llmCircuitBreakerService.recordFailure(primaryProvider.name);

      if (primaryProvider.name === 'ollama') {
        throw err; // Cannot fall back further if primary was already Ollama
      }

      const fallbackProvider = this.registry.getProvider('ollama');
      if (!fallbackProvider) {
        throw err;
      }

      console.warn('[LLMFallbackService] Falling back to Ollama provider...');
      const fallbackRes = await fallbackProvider.generate({ ...req, providerOverride: 'ollama' });
      llmCircuitBreakerService.recordSuccess(fallbackProvider.name);

      return {
        response: {
          ...fallbackRes,
          provider: 'ollama'
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
      llmCircuitBreakerService.recordFailure(primaryProvider.name);

      if (primaryProvider.name === 'ollama') {
        throw err;
      }

      const fallbackProvider = this.registry.getProvider('ollama');
      if (!fallbackProvider) {
        throw err;
      }

      console.warn('[LLMFallbackService] Streaming falling back to Ollama provider...');
      for await (const chunk of fallbackProvider.stream({ ...request, providerOverride: 'ollama' })) {
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
      llmCircuitBreakerService.recordFailure(primaryProvider.name);

      if (primaryProvider.name === 'ollama') {
        throw err;
      }

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
