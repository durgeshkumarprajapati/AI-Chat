import { EmbeddingProvider } from './embedding.provider.js';
import { workerEmbeddingProvider as workerOpenAIEmbeddingProvider } from './embedding.provider.js';
import { workerOllamaEmbeddingProvider } from './ollama.embedding.provider.js';

export function getWorkerEmbeddingProvider(): EmbeddingProvider {
  const providerType = process.env.EMBEDDING_PROVIDER || 'ollama';

  if (providerType === 'ollama') {
    return workerOllamaEmbeddingProvider;
  }

  if (providerType === 'openai') {
    return workerOpenAIEmbeddingProvider;
  }

  throw new Error(`Unsupported EMBEDDING_PROVIDER: "${providerType}". Must be "ollama" or "openai".`);
}
