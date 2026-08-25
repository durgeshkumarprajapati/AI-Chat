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

export class KimiProvider implements LLMProvider {
  public readonly name = 'kimi';
  private baseUrl: string;
  private apiKey?: string;
  private defaultModel: string;
  private isEnabled: boolean;

  constructor(options?: { baseUrl?: string; apiKey?: string; defaultModel?: string; enabled?: boolean }) {
    this.baseUrl = (options?.baseUrl || env.server?.LLM_KIMI_BASE_URL || process.env.LLM_KIMI_BASE_URL || 'https://api.moonshot.cn/v1').replace(/\/+$/, '');
    this.apiKey = options?.apiKey || env.server?.LLM_KIMI_API_KEY || process.env.LLM_KIMI_API_KEY;
    this.defaultModel = options?.defaultModel || env.server?.LLM_KIMI_DEFAULT_MODEL || process.env.LLM_KIMI_DEFAULT_MODEL || 'kimi-k3';
    this.isEnabled = options?.enabled ?? (env.server?.LLM_KIMI_ENABLED ?? (process.env.LLM_KIMI_ENABLED === 'true'));
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
    const isConfigured = !!this.apiKey;

    if (!this.isEnabled) {
      return {
        name: this.name,
        provider: this.name,
        status: 'disabled',
        configured: isConfigured,
        enabled: false,
        available: false,
        model: this.defaultModel,
        message: 'Kimi provider is disabled in environment config'
      };
    }
    if (!this.apiKey) {
      return {
        name: this.name,
        provider: this.name,
        status: 'unhealthy',
        configured: false,
        enabled: true,
        available: false,
        model: this.defaultModel,
        message: 'LLM_KIMI_API_KEY is not configured'
      };
    }

    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
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

  public async generate(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    if (!this.isEnabled || !this.apiKey) {
      throw new Error('Kimi provider is not enabled or missing API key.');
    }
    if (request.images?.length) {
      throw new Error(`${this.name} provider does not support multimodal image input.`);
    }

    const model = resolveModelForProvider(this.name, request.modelOverride, this.defaultModel);
    const systemPrompt = request.systemPrompt || 'You are an advanced AI reasoning assistant.';

    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    if (request.context) {
      messages.push({ role: 'user', content: `CONTEXT:\n${request.context}` });
    }
    messages.push({ role: 'user', content: request.prompt });

    const endpoint = `${this.baseUrl}/chat/completions`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), request.timeoutMs || 30000);

    if (request.signal) {
      request.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: request.temperature ?? 0.1,
          max_tokens: request.maxTokens || 1024,
          tools: request.tools
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Kimi API HTTP error ${res.status}: ${errText}`);
      }

      const data = await res.json();
      const choice = data.choices?.[0];
      const text = choice?.message?.content?.trim() || '';

      return {
        text,
        provider: this.name,
        model,
        complexity: 'HIGH',
        cached: false,
        totalMs: Date.now() - startTime,
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        toolCalls: choice?.message?.tool_calls
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  public async *stream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    if (!this.isEnabled || !this.apiKey) {
      throw new Error('Kimi provider is not enabled or missing API key.');
    }

    const model = resolveModelForProvider(this.name, request.modelOverride, this.defaultModel);
    const systemPrompt = request.systemPrompt || 'You are an advanced AI reasoning assistant.';

    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    if (request.context) {
      messages.push({ role: 'user', content: `CONTEXT:\n${request.context}` });
    }
    messages.push({ role: 'user', content: request.prompt });

    const endpoint = `${this.baseUrl}/chat/completions`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), request.timeoutMs || 30000);

    if (request.signal) {
      request.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          temperature: request.temperature ?? 0.1,
          max_tokens: request.maxTokens || 1024
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok || !res.body) {
        throw new Error(`Kimi stream HTTP error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let isFirst = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (trimmed.startsWith('data: ')) {
            const rawJson = trimmed.slice(6);
            try {
              const parsed = JSON.parse(rawJson);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                yield {
                  text: delta,
                  isFirstToken: isFirst,
                  done: false,
                  provider: this.name,
                  model
                };
                isFirst = false;
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  public async generateStructured<T>(request: StructuredLLMRequest<T>): Promise<T> {
    const jsonInstruction = request.schemaDescription
      ? `Output strictly valid JSON matching schema: ${request.schemaDescription}. Output raw JSON only.`
      : 'Output strictly valid JSON only.';

    const fullPrompt = `${request.prompt}\n\n${jsonInstruction}`;
    const res = await this.generate({
      ...request,
      prompt: fullPrompt
    });

    const raw = res.text.trim();
    if (request.parseResult) {
      return request.parseResult(raw);
    }

    const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    const jsonStr = match ? match[0] : raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr) as T;
  }
}

export const kimiProvider = new KimiProvider();
