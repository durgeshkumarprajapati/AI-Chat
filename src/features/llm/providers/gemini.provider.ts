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

export class GeminiProvider implements LLMProvider {
  public readonly name = 'gemini';
  private baseUrl: string;
  private apiKey?: string;
  private defaultFastModel: string;
  private defaultReasoningModel: string;
  private isEnabled: boolean;
  private timeoutMs: number;
  private maxOutputTokens: number;

  constructor(options?: {
    baseUrl?: string;
    apiKey?: string;
    fastModel?: string;
    reasoningModel?: string;
    enabled?: boolean;
    timeoutMs?: number;
    maxOutputTokens?: number;
  }) {
    this.baseUrl = (
      options?.baseUrl ||
      process.env.GEMINI_BASE_URL ||
      'https://generativelanguage.googleapis.com/v1beta/openai'
    ).replace(/\/+$/, '');
    this.apiKey = options?.apiKey || env.server?.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    this.defaultFastModel =
      options?.fastModel || env.server?.GEMINI_FAST_MODEL || process.env.GEMINI_FAST_MODEL || 'gemini-2.5-flash';
    this.defaultReasoningModel =
      options?.reasoningModel ||
      env.server?.GEMINI_REASONING_MODEL ||
      process.env.GEMINI_REASONING_MODEL ||
      'gemini-2.5-pro';
    this.isEnabled =
      options?.enabled ??
      (env.server?.GEMINI_ENABLED ?? (process.env.GEMINI_ENABLED !== 'false'));
    this.timeoutMs = options?.timeoutMs || env.server?.GEMINI_TIMEOUT_MS || 30000;
    this.maxOutputTokens = options?.maxOutputTokens || env.server?.GEMINI_MAX_OUTPUT_TOKENS || 4096;
  }

  public supports(capability: LLMCapability): boolean {
    return [
      LLMCapability.TEXT_GENERATION,
      LLMCapability.STREAMING,
      LLMCapability.STRUCTURED_OUTPUT,
      LLMCapability.TOOL_CALLING,
      LLMCapability.LONG_CONTEXT,
      LLMCapability.MULTIMODAL,
      LLMCapability.REASONING
    ].includes(capability);
  }

  public async healthCheck(): Promise<ProviderHealthStatus> {
    const start = Date.now();
    const apiKey = this.getApiKey();
    if (!this.isEnabled) {
      return { name: this.name, status: 'disabled', message: 'Gemini provider is disabled in configuration' };
    }
    if (!apiKey) {
      return { name: this.name, status: 'unhealthy', message: 'GEMINI_API_KEY is missing' };
    }

    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(3000)
      });
      const latencyMs = Date.now() - start;
      if (res.ok) {
        return { name: this.name, status: 'healthy', latencyMs };
      }
      return { name: this.name, status: 'unhealthy', latencyMs, message: `HTTP ${res.status}` };
    } catch (err) {
      return {
        name: this.name,
        status: 'unhealthy',
        latencyMs: Date.now() - start,
        message: err instanceof Error ? err.message : String(err)
      };
    }
  }

  private getApiKey(): string | undefined {
    return this.apiKey || env.server?.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  }

  public async generate(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();
    const apiKey = this.getApiKey();
    if (!this.isEnabled || !apiKey) {
      throw new Error('Gemini provider is not enabled or GEMINI_API_KEY is missing.');
    }

    const model =
      request.modelOverride ||
      (request.capabilitiesRequired?.includes(LLMCapability.REASONING)
        ? this.defaultReasoningModel
        : this.defaultFastModel);

    const systemPrompt = request.systemPrompt || 'You are an intelligent AI assistant powered by Google Gemini.';

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
          tools: request.tools
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Gemini API error (HTTP ${res.status}): ${errorText.slice(0, 200)}`);
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      const totalMs = Date.now() - startTime;

      return {
        text,
        provider: this.name,
        model,
        complexity: 'MEDIUM',
        cached: false,
        totalMs,
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
        toolCalls: data.choices?.[0]?.message?.tool_calls
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Gemini request timed out after ${request.timeoutMs || this.timeoutMs}ms. Check GEMINI_API_KEY, internet connectivity to Google APIs, or increase GEMINI_TIMEOUT_MS in .env.`);
      }
      throw err;
    }
  }

  public async *stream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const apiKey = this.getApiKey();
    if (!this.isEnabled || !apiKey) {
      throw new Error('Gemini provider is not enabled or GEMINI_API_KEY is missing.');
    }

    const model =
      request.modelOverride ||
      (request.capabilitiesRequired?.includes(LLMCapability.REASONING)
        ? this.defaultReasoningModel
        : this.defaultFastModel);

    const systemPrompt = request.systemPrompt || 'You are an intelligent AI assistant powered by Google Gemini.';

    const messages = [{ role: 'system', content: systemPrompt }];
    if (request.context) {
      messages.push({ role: 'user', content: `CONTEXT:\n${request.context}` });
    }
    messages.push({ role: 'user', content: request.prompt });

    const endpoint = `${this.baseUrl}/chat/completions`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), request.timeoutMs || this.timeoutMs);

    if (request.signal) {
      request.signal.addEventListener('abort', () => controller.abort());
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
          stream: true,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens || this.maxOutputTokens
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Gemini Stream API error (HTTP ${res.status}): ${errorText.slice(0, 200)}`);
      }

      if (!res.body) {
        throw new Error('Gemini stream response body is null');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
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
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') {
            yield { text: '', done: true, provider: this.name, model };
            return;
          }

          if (trimmed.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                yield {
                  text: content,
                  isFirstToken: isFirst,
                  done: false,
                  provider: this.name,
                  model
                };
                isFirst = false;
              }
            } catch {
              // Ignore partial JSON parse errors in SSE stream
            }
          }
        }
      }

      yield { text: '', done: true, provider: this.name, model };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Gemini streaming request timed out after ${request.timeoutMs || this.timeoutMs}ms.`);
      }
      throw err;
    }
  }

  public async generateStructured<T>(request: StructuredLLMRequest<T>): Promise<T> {
    const promptWithFormat = `${request.prompt}\n\nOUTPUT FORMAT INSTRUCTIONS:\nReturn ONLY valid JSON matching this schema description:\n${request.schemaDescription || 'Valid JSON object'}\n${request.exampleJson ? `Example JSON:\n${request.exampleJson}` : ''}\nDo NOT include markdown block syntax like \`\`\`json. Output raw JSON only.`;

    const res = await this.generate({
      ...request,
      prompt: promptWithFormat
    });

    let rawText = res.text.trim();
    if (rawText.startsWith('```')) {
      rawText = rawText.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
    }

    if (request.parseResult) {
      return request.parseResult(rawText);
    }

    return JSON.parse(rawText) as T;
  }
}

export const geminiProvider = new GeminiProvider();
