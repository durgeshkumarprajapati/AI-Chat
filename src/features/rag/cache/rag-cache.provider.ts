import { createHash } from 'crypto';
import { CacheKeyOptions, ExactCacheItem, SemanticCacheItem, SemanticCacheLookupResult } from './rag-cache.types';

export interface RAGCacheProvider {
  getExact(_keyOptions: CacheKeyOptions): Promise<ExactCacheItem | null>;
  setExact(_keyOptions: CacheKeyOptions, _item: ExactCacheItem, _ttlSeconds?: number): Promise<void>;

  getEmbedding(_provider: string, _model: string, _text: string): Promise<number[] | null>;
  setEmbedding(_provider: string, _model: string, _text: string, _vector: number[], _ttlSeconds?: number): Promise<void>;

  getSemantic(_keyOptions: CacheKeyOptions, _queryVector: number[], _threshold?: number): Promise<SemanticCacheItem | null>;
  getSemanticWithDiagnostics(_keyOptions: CacheKeyOptions, _queryVector: number[], _threshold?: number): Promise<SemanticCacheLookupResult>;
  setSemantic(_keyOptions: CacheKeyOptions, _item: SemanticCacheItem, _ttlSeconds?: number): Promise<void>;

  invalidateUser(_userId: string): Promise<void>;
  invalidateKnowledgeBase(_knowledgeBaseId: string): Promise<void>;
  invalidateDocument(_documentId: string): Promise<void>;
}

export function generateExactCacheKey(opts: CacheKeyOptions): string {
  const normQuery = opts.query.trim().toLowerCase();
  const sourceMode = opts.sourceMode || 'documents_only';
  const targetSite = opts.targetWebsite ? opts.targetWebsite.trim().toLowerCase() : '';
  const modeKey =
    opts.answerMode &&
    opts.answerMode !== 'GROUNDED' &&
    opts.answerMode !== 'DOCUMENT_GROUNDED' &&
    opts.answerMode !== 'WEB_GROUNDED' &&
    opts.answerMode !== 'MULTI_SOURCE_GROUNDED' &&
    opts.answerMode !== 'WEB_DISCOVERY_GROUNDED'
      ? opts.answerMode
      : 'GROUNDED';
  const rawString = `${opts.userId}|${opts.knowledgeBaseId || 'global'}|${sourceMode}|${targetSite}|${opts.model || 'default'}|${modeKey}|${opts.contextSummary || ''}|${normQuery}`;
  const hash = createHash('sha256').update(rawString).digest('hex');
  return `rag:exact:${opts.userId}:${hash}`;
}

export function generateSemanticScopeKey(opts: CacheKeyOptions): string {
  const sourceMode = opts.sourceMode || 'documents_only';
  const targetSite = opts.targetWebsite ? opts.targetWebsite.trim().toLowerCase() : '';
  const modeKey =
    opts.answerMode &&
    opts.answerMode !== 'GROUNDED' &&
    opts.answerMode !== 'DOCUMENT_GROUNDED' &&
    opts.answerMode !== 'WEB_GROUNDED' &&
    opts.answerMode !== 'MULTI_SOURCE_GROUNDED' &&
    opts.answerMode !== 'WEB_DISCOVERY_GROUNDED'
      ? opts.answerMode
      : 'GROUNDED';
  return `rag:semantic:index:${opts.userId}:${opts.knowledgeBaseId || 'global'}:${sourceMode}:${targetSite}:${opts.model || 'default'}:${modeKey}`;
}

export function generateEmbeddingCacheKey(provider: string, model: string, text: string): string {
  const normText = text.trim().toLowerCase();
  const hash = createHash('sha256').update(`${provider}:${model}:${normText}`).digest('hex');
  return `rag:embed:${hash}`;
}
