import { EmbeddingProvider, openAIEmbeddingProvider } from './embedding.provider';
import { ollamaEmbeddingProvider } from './ollama.embedding.provider';
import { env } from '../../../config/env';
import { ConfigurationError } from '../../../errors';

export function getEmbeddingProvider(): EmbeddingProvider {
  const providerType = process.env.EMBEDDING_PROVIDER || env.server?.EMBEDDING_PROVIDER || 'ollama';

  if (providerType === 'ollama') {
    return ollamaEmbeddingProvider;
  }

  if (providerType === 'openai') {
    return openAIEmbeddingProvider;
  }

  throw new ConfigurationError(`Unsupported EMBEDDING_PROVIDER: "${providerType}". Must be "ollama" or "openai".`);
}
