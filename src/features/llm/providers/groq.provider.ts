import { LLMProvider } from '../llm-provider.interface';
import {
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  StructuredLLMRequest,
  ProviderHealthStatus,
  LLMCapability
} from '../llm.types';
import { env } from '@/config/env';
import { resolveModelForProvider } from '../utils/model-validator';

export class GroqProvider implements LLMProvider {
  public readonly name = 'groq';
  private baseUrl: string;
  private apiKey?: string;
  private defaultModel: string;
  private reasoningModel: string;
  private isEnabled: boolean;
  private timeoutMs: number;
  private maxOutputTokens: number;

  constructor(options?: {
    baseUrl?: string;
    apiKey?: string;
    defaultModel?: string;
    reasoningModel?: string;
    enabled?: boolean;
    timeoutMs?: number;
    maxOutputTokens?: number;
  }) {
    this.baseUrl = (
      options?.baseUrl ||
      env.server?.GROQ_BASE_URL ||
      process.env.GROQ_BASE_URL ||
      'https://api.groq.com/openai/v1'
    ).replace(/\/+$/, '');
    this.apiKey =
      options?.apiKey !== undefined
        ? options.apiKey
        : env.server?.GROQ_API_KEY ||
          process.env.GROQ_API_KEY ||
          (process.env.NODE_ENV === 'test' ? 'gsk-mock-groq-key' : undefined);
    this.defaultModel =
      options?.defaultModel ||
      env.server?.GROQ_DEFAULT_MODEL ||
      process.env.GROQ_DEFAULT_MODEL ||
      'groq/compound';
    this.reasoningModel =
      options?.reasoningModel ||
      env.server?.GROQ_REASONING_MODEL ||
      process.env.GROQ_REASONING_MODEL ||
      'openai/gpt-oss-120b';
    this.isEnabled =
      options?.enabled ??
      (env.server?.GROQ_ENABLED ?? (process.env.GROQ_ENABLED !== 'false'));
    this.timeoutMs = options?.timeoutMs || env.server?.GROQ_TIMEOUT_MS || 60000;
    this.maxOutputTokens = options?.maxOutputTokens || env.server?.GROQ_MAX_OUTPUT_TOKENS || 4096;
  }

  public supports(capability: LLMCapability): boolean {
    return [
      LLMCapability.TEXT_GENERATION,
      LLMCapability.STREAMING,
      LLMCapability.STRUCTURED_OUTPUT,
      LLMCapability.TOOL_CALLING,
      LLMCapability.LONG_CONTEXT,
      LLMCapability.REASONING
    ].includes(capability);
  }

  public async healthCheck(): Promise<ProviderHealthStatus> {
    const start = Date.now();
    const apiKey = this.getApiKey();
    const isConfigured = !!apiKey;

    if (!this.isEnabled) {
      return {
        name: this.name,
        provider: this.name,
        status: 'disabled',
        configured: isConfigured,
        enabled: false,
        available: false,
        model: this.defaultModel,
        message: 'Groq provider is disabled in configuration'
      };
    }
    if (!apiKey) {
      return {
        name: this.name,
        provider: this.name,
        status: 'unhealthy',
        configured: false,
        enabled: true,
        available: false,
        model: this.defaultModel,
        message: 'GROQ_API_KEY is missing'
      };
    }

    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(3000)
      });
      const latencyMs = Date.now() - start;
      if (res.ok) {
        return {
          name: this.name,
          provider: this.name,
          status: 'healthy',
          configured: true,
          enabled: true,
          available: true,
          model: this.defaultModel,
          latencyMs
        };
      }
      return {
        name: this.name,
        provider: this.name,
        status: 'unhealthy',
        configured: true,
        enabled: true,
        available: false,
        model: this.defaultModel,
        latencyMs,
        message: `HTTP ${res.status}`
      };
    } catch (err) {
      return {
        name: this.name,
        provider: this.name,
        status: 'unhealthy',
        configured: true,
        enabled: true,
        available: false,
        model: this.defaultModel,
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : String(err)
      };
    }
  }

  private getApiKey(): string | undefined {
    return this.apiKey !== undefined ? this.apiKey : (env.server?.GROQ_API_KEY || process.env.GROQ_API_KEY);
  }

  public async generate(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    const apiKey = this.getApiKey();
    if (!this.isEnabled || !apiKey) {
      throw new Error('Groq provider is not enabled or GROQ_API_KEY is missing.');
    }
    if (request.images?.length) {
      throw new Error(`${this.name} provider does not support multimodal image input.`);
    }

    const fallbackModel = request.capabilitiesRequired?.includes(LLMCapability.REASONING)
      ? this.reasoningModel
      : this.defaultModel;
    const model = resolveModelForProvider(this.name, request.modelOverride, fallbackModel);

    const systemPrompt = request.systemPrompt || 'You are an intelligent AI assistant powered by Groq.';

    const messages = [{ role: 'system', content: systemPrompt }];
    if (request.context) {
      messages.push({ role: 'user', content: `CONTEXT:\n${request.context}` });
    }
    messages.push({ role: 'user', content: request.prompt });

    const endpoint = `${this.baseUrl}/chat/completions`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), request.timeoutMs || this.timeoutMs);

    if (request.signal) {
      if (request.signal.aborted) {
        controller.abort();
      } else {
        request.signal.addEventListener('abort', () => controller.abort());
      }
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens || this.maxOutputTokens
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`Groq API returned HTTP ${res.status}: ${errorText || res.statusText}`);
      }

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content || '';
      const totalMs = Date.now() - startTime;

      return {
        text: content,
        provider: this.name,
        model,
        complexity: request.capabilitiesRequired?.includes(LLMCapability.REASONING) ? 'HIGH' : 'MEDIUM',
        cached: false,
        totalMs,
        promptTokens: json.usage?.prompt_tokens,
        completionTokens: json.usage?.completion_tokens,
        finishReason: json.choices?.[0]?.finish_reason
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`Groq request timed out after ${request.timeoutMs || this.timeoutMs}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public async *stream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const apiKey = this.getApiKey();
    if (!this.isEnabled || !apiKey) {
      throw new Error('Groq provider is not enabled or GROQ_API_KEY is missing.');
    }

    const fallbackModel = request.capabilitiesRequired?.includes(LLMCapability.REASONING)
      ? this.reasoningModel
      : this.defaultModel;
    const model = resolveModelForProvider(this.name, request.modelOverride, fallbackModel);

    const systemPrompt = request.systemPrompt || 'You are an intelligent AI assistant powered by Groq.';
    const messages = [{ role: 'system', content: systemPrompt }];
    if (request.context) {
      messages.push({ role: 'user', content: `CONTEXT:\n${request.context}` });
    }
    messages.push({ role: 'user', content: request.prompt });

    const endpoint = `${this.baseUrl}/chat/completions`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), request.timeoutMs || this.timeoutMs);

    if (request.signal) {
      if (request.signal.aborted) {
        controller.abort();
      } else {
        request.signal.addEventListener('abort', () => controller.abort());
      }
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens || this.maxOutputTokens,
          stream: true
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`Groq Stream API returned HTTP ${res.status}: ${errorText || res.statusText}`);
      }

      if (!res.body) {
        throw new Error('Groq API response body is null.');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let isFirstChunk = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') {
            yield { text: '', done: true, provider: this.name, model };
            return;
          }

          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const chunkText = data.choices?.[0]?.delta?.content || '';
              if (chunkText) {
                yield {
                  text: chunkText,
                  isFirstToken: isFirstChunk,
                  done: false,
                  provider: this.name,
                  model
                };
                isFirstChunk = false;
              }
            } catch {
              // Ignore SSE JSON parse errors for incomplete chunks
            }
          }
        }
      }

      yield { text: '', done: true, provider: this.name, model };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`Groq streaming request timed out after ${request.timeoutMs || this.timeoutMs}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  public async generateStructured<T>(request: StructuredLLMRequest<T>): Promise<T> {
    const promptAddition = request.schemaDescription
      ? `\nReturn valid JSON matching this schema description:\n${request.schemaDescription}`
      : '\nReturn valid JSON object.';

    const systemPrompt = (request.systemPrompt || '') + promptAddition;

    const res = await this.generate({
      ...request,
      systemPrompt,
      capabilitiesRequired: [...(request.capabilitiesRequired || []), LLMCapability.STRUCTURED_OUTPUT]
    });

    const rawText = res.text.trim();
    if (request.parseResult) {
      return request.parseResult(rawText);
    }

    try {
      const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, rawText];
      return JSON.parse(jsonMatch[1] || rawText);
    } catch (err: any) {
      throw new Error(`Failed to parse structured Groq output as JSON: ${err.message}. Raw output: ${rawText}`);
    }
  }
}

export const groqProvider = new GroqProvider();
