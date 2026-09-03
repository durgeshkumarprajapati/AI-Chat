import { EmbeddingProvider } from './embedding.provider.js';
import { workerEmbeddingProvider as workerOpenAIEmbeddingProvider } from './embedding.provider.js';
import { workerOllamaEmbeddingProvider } from './ollama.embedding.provider.js';
import { workerTEIEmbeddingProvider } from './tei.embedding.provider.js';

/**
 * Phase 91.9 — added TEI as a third, fully optional provider. Existing "ollama"/"openai"
 * selection and error message are unchanged for anyone not setting EMBEDDING_PROVIDER=tei. There
 * is deliberately no fallback here: an unreachable/misconfigured TEI service throws from
 * WorkerTEIEmbeddingProvider.embedTexts() with a clear message rather than silently using a
 * different provider (would produce embeddings of a different, possibly incompatible dimension
 * for the same document without the operator noticing).
 */
export function getWorkerEmbeddingProvider(): EmbeddingProvider {
  const providerType = process.env.EMBEDDING_PROVIDER || 'ollama';

  if (providerType === 'ollama') {
    return workerOllamaEmbeddingProvider;
  }

  if (providerType === 'openai') {
    return workerOpenAIEmbeddingProvider;
  }

  if (providerType === 'tei') {
    return workerTEIEmbeddingProvider;
  }

  throw new Error(`Unsupported EMBEDDING_PROVIDER: "${providerType}". Must be "ollama", "openai", or "tei".`);
}
