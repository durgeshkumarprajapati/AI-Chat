import { EmbeddingProvider } from './embedding.provider.js';

export interface TEIEmbeddingProviderOptions {
  baseUrl?: string;
  expectedDimensions?: number;
  timeoutMs?: number;
  maxRetries?: number;
  initialDelayMs?: number;
}

/**
 * Optional HuggingFace Text Embeddings Inference provider. Mirrors
 * WorkerOllamaEmbeddingProvider's validation/retry structure exactly (same EmbeddingProvider
 * interface, same dimension/finite-value checks, same transient-error retry-with-backoff shape)
 * so the rest of the pipeline (embedding.service.ts) needs zero changes to use it.
 *
 * TEI's batch endpoint (`POST /embed` with `{ inputs: string[] }`) returns a bare
 * `number[][]` — no wrapper object, unlike Ollama's `{ embeddings: [...] }`.
 *
 * Per the "TEI must fail clearly, never silently fall back" requirement: this class never
 * catches its own construction-time misconfiguration (missing TEI_BASE_URL) silently — it throws
 * on the first embedTexts() call, which the existing document.processor.ts error-classification
 * path already surfaces as a clear FAILED document with a real error message.
 */
export class WorkerTEIEmbeddingProvider implements EmbeddingProvider {
  private readonly baseUrl: string;
  private readonly expectedDimensions: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly initialDelayMs: number;

  constructor(options?: TEIEmbeddingProviderOptions) {
    this.baseUrl = (options?.baseUrl ?? process.env.TEI_BASE_URL ?? '').replace(/\/+$/, '');
    this.expectedDimensions =
      options?.expectedDimensions ?? (process.env.TEI_EMBEDDING_DIMENSIONS ? Number(process.env.TEI_EMBEDDING_DIMENSIONS) : 768);
    this.timeoutMs = options?.timeoutMs ?? Number(process.env.TEI_TIMEOUT_MS || '30000');
    this.maxRetries = options?.maxRetries ?? 3;
    this.initialDelayMs = options?.initialDelayMs ?? 1000;
  }

  public async embedTexts(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) return [];

    if (!this.baseUrl) {
      throw new Error(
        'EMBEDDING_PROVIDER=tei requires TEI_BASE_URL to be configured. This is a hard failure by design — the worker never silently falls back to another embedding provider.'
      );
    }

    for (let i = 0; i < texts.length; i++) {
      const t = texts[i];
      if (!t || t.trim() === '') {
        throw new Error(`Cannot generate embedding for empty or whitespace-only text at index ${i}.`);
      }
    }

    let attempt = 0;

    while (attempt <= this.maxRetries) {
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(`${this.baseUrl}/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputs: texts }),
          signal: controller.signal
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          throw new Error(`TEI HTTP Error ${response.status}: ${errText}`);
        }

        const rawVectors = (await response.json()) as unknown;
        if (!Array.isArray(rawVectors) || rawVectors.length !== texts.length) {
          throw new Error(
            `TEI embedding response count mismatch. Expected ${texts.length} vectors, got ${Array.isArray(rawVectors) ? rawVectors.length : 0}`
          );
        }

        const validatedVectors: number[][] = [];
        for (let i = 0; i < rawVectors.length; i++) {
          const vector = rawVectors[i] as number[] | undefined;
          if (!vector || !Array.isArray(vector)) {
            throw new Error(`Missing TEI embedding vector for index ${i}`);
          }
          if (vector.length !== this.expectedDimensions) {
            throw new Error(
              `Embedding dimension mismatch at index ${i}. Expected ${this.expectedDimensions} (pgvector schema/index is fixed at this dimension), got ${vector.length}. Do not switch TEI models without a compatible pgvector migration.`
            );
          }
          for (let d = 0; d < vector.length; d++) {
            const val = vector[d];
            if (val === undefined || !Number.isFinite(val)) {
              throw new Error(`Invalid vector value at index ${i}, dimension ${d}: ${String(val)}`);
            }
          }
          validatedVectors.push(vector);
        }

        return validatedVectors;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (
          msg.includes('Cannot generate embedding') ||
          msg.includes('dimension mismatch') ||
          msg.includes('requires TEI_BASE_URL')
        ) {
          throw error;
        }

        const isTransient = this.isTransientError(error);
        if (isTransient && attempt < this.maxRetries) {
          attempt++;
          const jitter = Math.random() * 200;
          const delay = this.initialDelayMs * Math.pow(2, attempt - 1) + jitter;
          console.warn(`[WorkerTEIEmbeddingProvider] Transient error (attempt ${attempt}/${this.maxRetries}). Retrying in ${Math.round(delay)}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
          throw new Error(`Infrastructure error: Unable to connect to TEI server at ${this.baseUrl}. Ensure the TEI service is running.`);
        }

        throw new Error(`TEI Embedding Provider failed: ${msg}`);
      } finally {
        clearTimeout(timeoutHandle);
      }
    }

    throw new Error('TEI Embedding Provider failed after maximum retries.');
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
      msg.includes('AbortError') ||
      msg.includes('fetch failed')
    );
  }
}

export const workerTEIEmbeddingProvider = new WorkerTEIEmbeddingProvider();
