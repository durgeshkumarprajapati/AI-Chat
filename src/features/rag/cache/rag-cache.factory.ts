import { RAGCacheProvider } from './rag-cache.provider';
import { RedisRAGCacheProvider } from './redis-rag-cache.provider';

let cachedProvider: RAGCacheProvider | null = null;

export function getRAGCacheProvider(): RAGCacheProvider {
  if (!cachedProvider) {
    cachedProvider = new RedisRAGCacheProvider();
  }
  return cachedProvider;
}
