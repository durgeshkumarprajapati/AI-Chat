jest.mock('@/features/rag/query-intelligence/cache/query-intelligence-cache.service', () => ({
  queryIntelligenceCacheService: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) }
}));
jest.mock('@/features/rag/query-intelligence/llm-enhancement/llm-query-enhancer.service', () => ({
  llmQueryEnhancerService: { enhance: jest.fn().mockResolvedValue(null) }
}));

import { queryIntelligenceCacheService } from '@/features/rag/query-intelligence/cache/query-intelligence-cache.service';
import { llmQueryEnhancerService } from '@/features/rag/query-intelligence/llm-enhancement/llm-query-enhancer.service';
import { queryIntelligenceService } from '@/features/rag/query-intelligence/query-intelligence.service';

describe('QueryIntelligenceService — Phase 69B', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns a heuristic-only result when LLM enhancement is disabled', async () => {
    const result = await queryIntelligenceService.analyze('user-1', 'What are the OAuth security requirements?', {
      useLLMEnhancement: false,
      timeoutMs: 3000
    });

    expect(result.source).toBe('heuristic');
    expect(llmQueryEnhancerService.enhance).not.toHaveBeenCalled();
  });

  it('merges LLM enhancement fields on top of the heuristic result when enabled', async () => {
    (llmQueryEnhancerService.enhance as jest.Mock).mockResolvedValue({ intent: 'COMPARATIVE' });

    const result = await queryIntelligenceService.analyze('user-1', 'What are the OAuth security requirements?', {
      useLLMEnhancement: true,
      timeoutMs: 3000
    });

    expect(result.intent).toBe('COMPARATIVE');
    expect(result.source).toBe('heuristic+llm');
  });

  it('short-circuits on a cache hit and never calls the LLM enhancer', async () => {
    (queryIntelligenceCacheService.get as jest.Mock).mockResolvedValue({
      intent: 'FACTUAL',
      expectedDocumentTypes: [],
      expectedSections: [],
      isBroad: false,
      isAmbiguous: false,
      isTableOrChartQuery: false,
      complexity: 0.1,
      retrievalStrategy: 'BALANCED',
      source: 'heuristic',
      analysisMs: 1,
      cacheHit: false
    });

    const result = await queryIntelligenceService.analyze('user-1', 'cached question', { useLLMEnhancement: true, timeoutMs: 3000 });

    expect(result.cacheHit).toBe(true);
    expect(llmQueryEnhancerService.enhance).not.toHaveBeenCalled();
  });

  it('never throws even if the cache lookup itself throws', async () => {
    (queryIntelligenceCacheService.get as jest.Mock).mockRejectedValue(new Error('redis down'));

    await expect(
      queryIntelligenceService.analyze('user-1', 'a question', { useLLMEnhancement: false, timeoutMs: 3000 })
    ).resolves.toMatchObject({ source: 'heuristic-fallback' });
  });
});
