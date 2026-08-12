import { EmbeddingProvider } from './embedding.provider';
import { env } from '../../../config/env';
import { DocumentProcessingError, InfrastructureError } from '../../../errors';

export interface OllamaEmbeddingProviderOptions {
  baseUrl?: string;
  model?: string;
  expectedDimensions?: number;
  maxRetries?: number;
  initialDelayMs?: number;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private baseUrl: string;
  private model: string;
  private expectedDimensions: number;
  private maxRetries: number;
  private initialDelayMs: number;

  constructor(options?: OllamaEmbeddingProviderOptions) {
    const rawUrl = options?.baseUrl || env.server?.OLLAMA_BASE_URL || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
    this.baseUrl = rawUrl.replace(/\/+$/, '');
    this.model = options?.model || env.server?.OLLAMA_EMBEDDING_MODEL || process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text';
    this.expectedDimensions = options?.expectedDimensions || env.server?.OLLAMA_EMBEDDING_DIMENSIONS || (process.env.OLLAMA_EMBEDDING_DIMENSIONS ? Number(process.env.OLLAMA_EMBEDDING_DIMENSIONS) : 768);
    this.maxRetries = options?.maxRetries ?? 3;
    this.initialDelayMs = options?.initialDelayMs ?? 1000;
  }

  public async embedTexts(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }

    for (let i = 0; i < texts.length; i++) {
      const t = texts[i];
      if (!t || t.trim() === '') {
        throw new DocumentProcessingError(`Cannot generate embedding for empty or whitespace-only text at index ${i}.`);
      }
    }

    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        const endpoint = `${this.baseUrl}/api/embed`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            input: texts
          })
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          if (response.status === 404 || errText.includes('not found')) {
            throw new InfrastructureError(
              'Ollama Model',
              `Ollama model "${this.model}" is not installed. Run "ollama pull ${this.model}" to install.`
            );
          }
          throw new Error(`Ollama HTTP Error ${response.status}: ${errText}`);
        }

        const data = (await response.json()) as { embeddings?: number[][]; embedding?: number[] };
        let rawVectors: number[][] = [];

        if (Array.isArray(data.embeddings)) {
          rawVectors = data.embeddings;
        } else if (Array.isArray(data.embedding)) {
          rawVectors = [data.embedding];
        }

        if (!rawVectors || rawVectors.length !== texts.length) {
          throw new DocumentProcessingError(
            `Ollama embedding response count mismatch. Expected ${texts.length} vectors, got ${rawVectors ? rawVectors.length : 0}`
          );
        }

        const validatedVectors: number[][] = [];

        for (let i = 0; i < rawVectors.length; i++) {
          const vector = rawVectors[i];
          if (!vector) {
            throw new DocumentProcessingError(`Missing Ollama embedding vector for index ${i}`);
          }

          if (vector.length !== this.expectedDimensions) {
            throw new DocumentProcessingError(
              `Embedding dimension mismatch at index ${i}. Expected ${this.expectedDimensions}, got ${vector.length}`
            );
          }

          for (let d = 0; d < vector.length; d++) {
            const val = vector[d];
            if (val === undefined || !Number.isFinite(val) || Number.isNaN(val)) {
              throw new DocumentProcessingError(`Invalid vector value at index ${i}, dimension ${d}: ${String(val)}`);
            }
          }

          validatedVectors.push(vector);
        }

        return validatedVectors;
      } catch (error) {
        if (error instanceof DocumentProcessingError || error instanceof InfrastructureError) {
          throw error;
        }

        const isTransient = this.isTransientError(error);

        if (isTransient && attempt < this.maxRetries) {
          attempt++;
          const jitter = Math.random() * 200;
          const delay = this.initialDelayMs * Math.pow(2, attempt - 1) + jitter;
          console.warn(`[OllamaEmbeddingProvider] Transient error (attempt ${attempt}/${this.maxRetries}). Retrying in ${Math.round(delay)}ms...`);
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

        throw new DocumentProcessingError(`Ollama Embedding Provider failed: ${msg}`);
      }
    }

    throw new DocumentProcessingError('Ollama Embedding Provider failed after maximum retries.');
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

export const ollamaEmbeddingProvider = new OllamaEmbeddingProvider();
