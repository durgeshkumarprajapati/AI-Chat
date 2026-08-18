import { LLMProvider } from '@/features/llm/llm-provider.interface';
import {
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  StructuredLLMRequest,
  ProviderHealthStatus,
  LLMCapability
} from '@/features/llm/llm.types';

export class MockOllamaProvider implements LLMProvider {
  public readonly name = 'Mock Ollama Provider';
  public shouldFail = false;
  public generateCount = 0;

  public async generate(req: LLMRequest): Promise<LLMResponse> {
    this.generateCount++;
    if (this.shouldFail) {
      throw new Error('[MockOllamaProvider] Connection failed');
    }
    return {
      text: `[Mock Ollama Response] Answer for prompt: ${req.prompt}`,
      model: req.modelOverride || 'llama3.2',
      provider: 'ollama',
      promptTokens: 20,
      completionTokens: 15,
      complexity: 'LOW',
      cached: false,
      totalMs: 15
    };
  }

  public async *stream(req: LLMRequest): AsyncIterable<LLMStreamChunk> {
    if (this.shouldFail) {
      throw new Error('[MockOllamaProvider] Stream connection failed');
    }
    yield { text: `[Mock Ollama ${req.prompt.slice(0, 5)} `, isFirstToken: true };
    yield { text: 'Streamed Answer]' };
  }

  public async generateStructured<T>(req: StructuredLLMRequest<T>): Promise<T> {
    if (this.shouldFail) {
      throw new Error('[MockOllamaProvider] Structured generation failed');
    }
    return { mockStructured: true, prompt: req.prompt } as unknown as T;
  }

  public async healthCheck(): Promise<ProviderHealthStatus> {
    return {
      name: 'ollama',
      status: this.shouldFail ? 'unhealthy' : 'healthy',
      latencyMs: 5
    };
  }

  public supports(_capability: LLMCapability): boolean {
    return true;
  }
}

export class MockKimiProvider implements LLMProvider {
  public readonly name = 'Mock Kimi Provider';
  public shouldFail = false;
  public generateCount = 0;

  public async generate(req: LLMRequest): Promise<LLMResponse> {
    this.generateCount++;
    if (this.shouldFail) {
      throw new Error('[MockKimiProvider] API rate limit exceeded');
    }
    return {
      text: `[Mock Kimi High-Reasoning Response] Deep analysis for: ${req.prompt}`,
      model: req.modelOverride || 'kimi-k3',
      provider: 'kimi',
      promptTokens: 50,
      completionTokens: 40,
      complexity: 'HIGH',
      cached: false,
      totalMs: 45
    };
  }

  public async *stream(req: LLMRequest): AsyncIterable<LLMStreamChunk> {
    if (this.shouldFail) {
      throw new Error('[MockKimiProvider] Stream failed');
    }
    yield { text: `[Mock Kimi ${req.prompt.slice(0, 5)} `, isFirstToken: true };
    yield { text: 'High-Reasoning Stream]' };
  }

  public async generateStructured<T>(req: StructuredLLMRequest<T>): Promise<T> {
    if (this.shouldFail) {
      throw new Error('[MockKimiProvider] Structured generation failed');
    }
    return { mockStructured: true, prompt: req.prompt } as unknown as T;
  }

  public async healthCheck(): Promise<ProviderHealthStatus> {
    return {
      name: 'kimi',
      status: this.shouldFail ? 'unhealthy' : 'healthy',
      latencyMs: 12
    };
  }

  public supports(_capability: LLMCapability): boolean {
    return true;
  }
}

export const mockOllamaProvider = new MockOllamaProvider();
export const mockKimiProvider = new MockKimiProvider();
