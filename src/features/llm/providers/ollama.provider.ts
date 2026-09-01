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

export class OllamaProvider implements LLMProvider {
  public readonly name = 'ollama';
  private baseUrl: string;
  private defaultModel: string;
  private fastModel: string;
  private timeoutMs: number;
  public readonly isEnabled: boolean;

  constructor(options?: { baseUrl?: string; defaultModel?: string; fastModel?: string; timeoutMs?: number; enabled?: boolean }) {
    const rawUrl = options?.baseUrl || env.server?.OLLAMA_BASE_URL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.baseUrl = rawUrl.replace(/\/+$/, '');
    this.defaultModel = options?.defaultModel || env.server?.OLLAMA_CHAT_MODEL || process.env.OLLAMA_CHAT_MODEL || 'llama3.2';
    this.fastModel = options?.fastModel || env.server?.LLM_OLLAMA_FAST_MODEL || this.defaultModel;
    this.timeoutMs = options?.timeoutMs || env.server?.OLLAMA_TIMEOUT_MS || (process.env.OLLAMA_TIMEOUT_MS ? parseInt(process.env.OLLAMA_TIMEOUT_MS, 10) : 5000);
    this.isEnabled = options?.enabled ?? (process.env.OLLAMA_ENABLED !== undefined ? process.env.OLLAMA_ENABLED === 'true' : (env.server?.OLLAMA_ENABLED ?? true));
  }

  public supports(capability: LLMCapability): boolean {
    return [
      LLMCapability.TEXT_GENERATION,
      LLMCapability.STREAMING,
      LLMCapability.STRUCTURED_OUTPUT,
      LLMCapability.LONG_CONTEXT
    ].includes(capability);
  }

  public async healthCheck(): Promise<ProviderHealthStatus> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/api/version`, {
        signal: AbortSignal.timeout(2000)
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
    if (!this.isEnabled) {
      throw new Error('Ollama provider is disabled.');
    }
    if (request.images?.length) {
      throw new Error(`${this.name} provider does not support multimodal image input.`);
    }

    // Fast pre-flight reachability check (1.5s timeout) to prevent 15s worker delays when Ollama is down/unresponsive
    try {
      const ping = await fetch(`${this.baseUrl}/api/version`, { signal: AbortSignal.timeout(1500) }).catch(() => null);
      if (!ping || !ping.ok) {
        throw new Error(`Ollama service is unreachable at ${this.baseUrl}`);
      }
    } catch (err: any) {
      if (err.message?.includes('unreachable')) throw err;
      throw new Error(`Ollama service is unreachable at ${this.baseUrl}`);
    }

    const fallbackModel = request.feature === 'CITY_EXPLORER' ? this.fastModel : this.defaultModel;
    const model = resolveModelForProvider(this.name, request.modelOverride, fallbackModel);
    const systemPrompt = request.systemPrompt || 'You are an authoritative AI assistant. Provide concise, accurate responses.';

    let promptText = request.prompt;
    if (request.context) {
      promptText = `CONTEXT:\n${request.context}\n\nUSER PROMPT:\n${request.prompt}`;
    }

    const endpoint = `${this.baseUrl}/api/generate`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), request.timeoutMs || this.timeoutMs);

    if (request.signal) {
      request.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          system: systemPrompt,
          prompt: promptText,
          stream: false,
          options: {
            num_predict: request.maxTokens || env.server?.RAG_LLM_MAX_OUTPUT_TOKENS || 512,
            temperature: request.temperature ?? env.server?.RAG_LLM_TEMPERATURE ?? 0.1
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Ollama HTTP Error ${res.status}: ${errText}`);
      }

      const data = (await res.json()) as { response?: string; prompt_eval_count?: number; eval_count?: number };
      const text = data.response?.trim() || '';

      if (!text) {
        throw new Error('Ollama provider returned empty text.');
      }

      return {
        text,
        provider: this.name,
        model,
        complexity: 'LOW',
        cached: false,
        totalMs: Date.now() - startTime,
        promptTokens: data.prompt_eval_count,
        completionTokens: data.eval_count
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Ollama request timed out after ${request.timeoutMs || this.timeoutMs}ms.`);
      }
      throw err;
    }
  }

  public async *stream(request: LLMRequest): AsyncIterable<LLMStreamChunk> {
    const fallbackModel = request.feature === 'CITY_EXPLORER' ? this.fastModel : this.defaultModel;
    const model = resolveModelForProvider(this.name, request.modelOverride, fallbackModel);
    const systemPrompt = request.systemPrompt || 'You are an authoritative AI assistant. Provide concise, accurate responses.';

    let promptText = request.prompt;
    if (request.context) {
      promptText = `CONTEXT:\n${request.context}\n\nUSER PROMPT:\n${request.prompt}`;
    }

    const endpoint = `${this.baseUrl}/api/generate`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), request.timeoutMs || this.timeoutMs);

    if (request.signal) {
      request.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          system: systemPrompt,
          prompt: promptText,
          stream: true,
          options: {
            num_predict: request.maxTokens || env.server?.RAG_LLM_MAX_OUTPUT_TOKENS || 512,
            temperature: request.temperature ?? env.server?.RAG_LLM_TEMPERATURE ?? 0.1
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!res.ok || !res.body) {
        throw new Error(`Ollama stream error status ${res.status}`);
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
          if (!trimmed) continue;
          try {
            const parsed = JSON.parse(trimmed) as { response?: string };
            if (parsed.response) {
              yield {
                text: parsed.response,
                isFirstToken: isFirst,
                done: false,
                provider: this.name,
                model
              };
              isFirst = false;
            }
          } catch {
            // Ignore partial line parse errors
          }
        }
      }

      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer.trim()) as { response?: string };
          if (parsed.response) {
            yield {
              text: parsed.response,
              isFirstToken: isFirst,
              done: true,
              provider: this.name,
              model
            };
          }
        } catch {}
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw err;
    }
  }

  public async generateStructured<T>(request: StructuredLLMRequest<T>): Promise<T> {
    const jsonInstruction = request.schemaDescription
      ? `Output strictly valid JSON matching this schema: ${request.schemaDescription}. No markdown wrappers, no explanations.`
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

export const ollamaProvider = new OllamaProvider();
