import { LLMProvider, LLMGenerateInput } from './llm.provider';
import { env } from '@/config/env';
import { InfrastructureError, DocumentProcessingError } from '@/errors';

export interface OllamaLLMProviderOptions {
  baseUrl?: string;
  model?: string;
  maxRetries?: number;
  initialDelayMs?: number;
}

export class OllamaLLMProvider implements LLMProvider {
  private baseUrl: string;
  private model: string;
  private maxRetries: number;
  private initialDelayMs: number;
  private maxOutputTokens: number;
  private temperature: number;

  constructor(options?: OllamaLLMProviderOptions) {
    const rawUrl = options?.baseUrl || env.server?.OLLAMA_BASE_URL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.baseUrl = rawUrl.replace(/\/+$/, '');
    this.model = options?.model || env.server?.OLLAMA_CHAT_MODEL || process.env.OLLAMA_CHAT_MODEL || 'llama3.2';
    this.maxRetries = options?.maxRetries ?? 2;
    this.initialDelayMs = options?.initialDelayMs ?? 1000;
    this.maxOutputTokens = env.server?.RAG_LLM_MAX_OUTPUT_TOKENS ?? 512;
    this.temperature = env.server?.RAG_LLM_TEMPERATURE ?? 0.1;
  }

  public async generateAnswer(input: LLMGenerateInput): Promise<string> {
    const systemPrompt = `You are a document question-answering assistant.

Answer the user's question using ONLY the provided document context.

Rules:
1. Do not use external knowledge.
2. Do not invent facts or assumptions.
3. If the context does not contain enough information to answer the question, explicitly state: "I couldn't find enough relevant information in your uploaded documents to answer that question."
4. Every factual claim should be supported by the supplied context.
5. Keep answers concise, factual, and well-structured.`;

    const prompt = `DOCUMENT CONTEXT:
${input.context}

USER QUESTION:
${input.question}`;

    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        const endpoint = `${this.baseUrl}/api/generate`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            system: systemPrompt,
            prompt: prompt,
            stream: false
            ,options: { num_predict: this.maxOutputTokens, temperature: this.temperature }
          })
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          if (response.status === 404 || errText.includes('not found')) {
            throw new InfrastructureError(
              'Ollama Chat Model',
              `Ollama model "${this.model}" is not installed. Run "ollama pull ${this.model}" to install.`
            );
          }
          throw new Error(`Ollama HTTP Error ${response.status}: ${errText}`);
        }

        const data = (await response.json()) as { response?: string };
        const answerText = data.response?.trim();

        if (!answerText) {
          throw new DocumentProcessingError('Ollama LLM provider returned empty response.');
        }

        return answerText;
      } catch (error) {
        if (error instanceof DocumentProcessingError || error instanceof InfrastructureError) {
          throw error;
        }

        const isTransient = this.isTransientError(error);

        if (isTransient && attempt < this.maxRetries) {
          attempt++;
          const jitter = Math.random() * 200;
          const delay = this.initialDelayMs * Math.pow(2, attempt - 1) + jitter;
          console.warn(`[OllamaLLMProvider] Transient error (attempt ${attempt}/${this.maxRetries}). Retrying in ${Math.round(delay)}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
          throw new InfrastructureError(
            'Ollama Server',
            `Unable to connect to Ollama server at ${this.baseUrl}. Ensure Ollama service is running.`
          );
        }

        throw new DocumentProcessingError(`Ollama LLM Provider failed: ${msg}`);
      }
    }

    throw new DocumentProcessingError('Ollama LLM Provider failed after maximum retries.');
  }

  public async *streamAnswer(input: LLMGenerateInput): AsyncIterable<string> {
    const systemPrompt = `You are a document question-answering assistant.

Answer the user's question using ONLY the provided document context.

Rules:
1. Do not use external knowledge.
2. Do not invent facts or assumptions.
3. If the context does not contain enough information to answer the question, explicitly state: "I couldn't find enough relevant information in your uploaded documents to answer that question."
4. Every factual claim should be supported by the supplied context.
5. Keep answers concise, factual, and well-structured.`;

    const prompt = `DOCUMENT CONTEXT:
${input.context}

USER QUESTION:
${input.question}`;

    const endpoint = `${this.baseUrl}/api/generate`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        system: systemPrompt,
        prompt: prompt,
            stream: true
        ,options: { num_predict: this.maxOutputTokens, temperature: this.temperature }
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      if (response.status === 404 || errText.includes('not found')) {
        throw new InfrastructureError(
          'Ollama Chat Model',
          `Ollama model "${this.model}" is not installed. Run "ollama pull ${this.model}" to install.`
        );
      }
      throw new Error(`Ollama HTTP Error ${response.status}: ${errText}`);
    }

    if (!response.body) {
      throw new DocumentProcessingError('Ollama streaming response body is missing.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

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
          const parsed = JSON.parse(trimmed) as { response?: string; done?: boolean };
          if (parsed.response) {
            yield parsed.response;
          }
        } catch {
          // Ignore partial line json parse errors
        }
      }
    }

    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim()) as { response?: string };
        if (parsed.response) {
          yield parsed.response;
        }
      } catch {
        // Ignore partial line json parse errors
      }
    }
  }

  private isTransientError(error: unknown): boolean {
    if (!error) return false;
    const msg = error instanceof Error ? error.message : String(error);

    return (
      msg.includes('500') ||
      msg.includes('502') ||
      msg.includes('503') ||
      msg.includes('504') ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('ECONNRESET') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('fetch failed')
    );
  }
}

export const ollamaLLMProvider = new OllamaLLMProvider();
