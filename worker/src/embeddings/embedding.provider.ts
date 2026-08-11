import OpenAI from 'openai';

export interface EmbeddingProvider {
  embedTexts(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingProviderOptions {
  model?: string;
  expectedDimensions?: number;
  maxRetries?: number;
  initialDelayMs?: number;
}

export class WorkerOpenAIEmbeddingProvider implements EmbeddingProvider {
  private client: OpenAI;
  private model: string;
  private expectedDimensions: number;
  private maxRetries: number;
  private initialDelayMs: number;

  constructor(options?: EmbeddingProviderOptions) {
    const apiKey = process.env.OPENAI_API_KEY || 'mock-api-key';
    this.client = new OpenAI({ apiKey });
    this.model = options?.model || process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
    this.expectedDimensions = options?.expectedDimensions || (process.env.OPENAI_EMBEDDING_DIMENSIONS ? Number(process.env.OPENAI_EMBEDDING_DIMENSIONS) : 1536);
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
        throw new Error(`Cannot generate embedding for empty or whitespace-only text at index ${i}.`);
      }
    }

    let attempt = 0;

    while (attempt <= this.maxRetries) {
      try {
        const response = await this.client.embeddings.create({
          model: this.model,
          input: texts
        });

        const dataItems = response.data;

        if (!dataItems || dataItems.length !== texts.length) {
          throw new Error(
            `Embedding response count mismatch. Expected ${texts.length} vectors, got ${dataItems ? dataItems.length : 0}`
          );
        }

        const sortedData = [...dataItems].sort((a, b) => a.index - b.index);
        const vectors: number[][] = [];

        for (let i = 0; i < sortedData.length; i++) {
          const item = sortedData[i];
          const vector = item?.embedding;

          if (!vector) {
            throw new Error(`Missing embedding vector for index ${i}`);
          }

          if (vector.length !== this.expectedDimensions) {
            throw new Error(
              `Embedding dimension mismatch at index ${i}. Expected ${this.expectedDimensions}, got ${vector.length}`
            );
          }

          for (let d = 0; d < vector.length; d++) {
            const val = vector[d];
            if (val === undefined || !Number.isFinite(val) || Number.isNaN(val)) {
              throw new Error(`Invalid vector value at index ${i}, dimension ${d}: ${String(val)}`);
            }
          }

          vectors.push(vector);
        }

        return vectors;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('Cannot generate embedding') || msg.includes('dimension mismatch') || msg.includes('count mismatch')) {
          throw error;
        }

        const isTransient = this.isTransientError(error);

        if (isTransient && attempt < this.maxRetries) {
          attempt++;
          const jitter = Math.random() * 200;
          const delay = this.initialDelayMs * Math.pow(2, attempt - 1) + jitter;
          console.warn(`[WorkerOpenAIEmbeddingProvider] Transient embedding failure (attempt ${attempt}/${this.maxRetries}). Retrying in ${Math.round(delay)}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (msg.includes('401') || msg.includes('Incorrect API key') || msg.includes('invalid_api_key')) {
          throw new Error('Infrastructure error in OpenAI Authentication: Invalid or missing OpenAI API Key.');
        }

        throw new Error(`OpenAI Embedding Provider failed: ${msg}`);
      }
    }

    throw new Error('OpenAI Embedding Provider failed after maximum retries.');
  }

  private isTransientError(error: unknown): boolean {
    if (!error) return false;
    const msg = error instanceof Error ? error.message : String(error);

    return (
      msg.includes('429') ||
      msg.includes('rate limit') ||
      msg.includes('500') ||
      msg.includes('502') ||
      msg.includes('503') ||
      msg.includes('504') ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('ECONNRESET')
    );
  }
}

export const workerEmbeddingProvider = new WorkerOpenAIEmbeddingProvider();
