import { queryNormalizer } from '@/features/rag/cache/query-normalizer';
import { retrievalCandidateCacheService } from '@/features/rag/cache/retrieval-candidate-cache.service';
import { answerCacheService } from '@/features/rag/cache/answer-cache.service';
import { rerankCacheService } from '@/features/rag/cache/rerank-cache.service';
import { redis } from '@/lib/redis';

jest.mock('@/lib/redis', () => ({
  redis: {
    getJson: jest.fn(),
    setJson: jest.fn()
  }
}));

describe('Phase 71D — Multi-Level RAG Cache Engine & Query Normalization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Query Normalizer', () => {
    it('normalizes whitespace, capitalization, and punctuation while preserving original query', () => {
      const result = queryNormalizer.normalize('   What is   RAG?  ');
      expect(result.originalQuery).toBe('What is   RAG?');
      expect(result.normalizedQuery).toBe('what is rag');
      expect(result.queryHash).toBeDefined();
      expect(result.queryHash.length).toBe(16);
    });

    it('produces identical queryHash for equivalent queries', () => {
      const q1 = queryNormalizer.normalize('What is RAG?');
      const q2 = queryNormalizer.normalize('what is   rag');
      expect(q1.queryHash).toBe(q2.queryHash);
    });
  });

  describe('2. Retrieval Candidate Cache Service', () => {
    it('generates authorization-sensitive key incorporating tenant, scope, scopeId, and source version', () => {
      const key = retrievalCandidateCacheService.generateKey({
        tenantId: 'tenant-1',
        scopeType: 'PROJECT',
        scopeId: 'project-100',
        sourceVersionHash: 'vhash-123',
        queryHash: 'qhash-456'
      });

      expect(key).toBe(
        'rag:v3:retrieval:tenant:tenant-1:scope:PROJECT:scopeId:project-100:sources:vhash-123:query:qhash-456:strategy:default'
      );
    });

    it('reads candidates from Redis when cache is enabled', async () => {
      const mockChunks = [
        {
          id: 'chunk-1',
          documentId: 'doc-1',
          filename: 'test.pdf',
          chunkIndex: 0,
          pageNumber: 1,
          content: 'Sample text',
          tokenCount: 10,
          similarity: 0.9
        }
      ];

      (redis.getJson as jest.Mock).mockResolvedValue(mockChunks);

      const result = await retrievalCandidateCacheService.getCandidates({
        tenantId: 't1',
        scopeType: 'PRIVATE',
        scopeId: 'u1',
        sourceVersionHash: 'sv1',
        queryHash: 'qh1'
      });

      expect(result).toEqual(mockChunks);
    });
  });

  describe('3. Answer Cache Service', () => {
    it('generates scope-isolated answer key with context hash', () => {
      const key = answerCacheService.generateKey({
        tenantId: 'tenant-1',
        scopeType: 'GROUP',
        scopeId: 'group-10',
        conversationId: 'conv-99',
        sourceVersionHash: 'sv-123',
        queryHash: 'qh-456',
        contextHash: 'ctx-789'
      });

      expect(key).toBe(
        'rag:v3:answer:tenant:tenant-1:scope:GROUP:scopeId:group-10:conversation:conv-99:sources:sv-123:query:qh-456:context:ctx-789'
      );
    });
  });

  describe('4. Rerank Cache Service', () => {
    it('generates rerank key with candidate set hash', () => {
      const candidateHash = rerankCacheService.generateCandidateSetHash([
        { id: 'c1', documentId: 'd1', filename: 'f1', chunkIndex: 0, pageNumber: 1, content: 'a', tokenCount: 1, similarity: 0.8, metadata: {} },
        { id: 'c2', documentId: 'd2', filename: 'f2', chunkIndex: 1, pageNumber: 1, content: 'b', tokenCount: 1, similarity: 0.7, metadata: {} }
      ]);

      const key = rerankCacheService.generateKey({
        tenantId: 'tenant-1',
        queryHash: 'qh-1',
        candidateSetHash: candidateHash
      });

      expect(key).toContain('rag:v3:rerank:tenant:tenant-1:query:qh-1:candidates:');
    });
  });
});
