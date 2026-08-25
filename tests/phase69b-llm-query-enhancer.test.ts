jest.mock('@/features/llm/llm-gateway.service', () => ({
  llmGateway: { generate: jest.fn() }
}));

import { llmGateway } from '@/features/llm/llm-gateway.service';
import { llmQueryEnhancerService } from '@/features/rag/query-intelligence/llm-enhancement/llm-query-enhancer.service';
import { heuristicAnalyzerService } from '@/features/rag/query-intelligence/heuristics/heuristic-analyzer.service';

const heuristicResult = heuristicAnalyzerService.analyze('What are the OAuth security requirements?');

describe('LLMQueryEnhancerService — Phase 69B', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns validated fields for a well-formed JSON response', async () => {
    (llmGateway.generate as jest.Mock).mockResolvedValue({
      text: JSON.stringify({ intent: 'FACTUAL', expectedSections: ['Security', 'Authentication'] })
    });

    const result = await llmQueryEnhancerService.enhance('q', heuristicResult, 'user-1', 3000);

    expect(result?.intent).toBe('FACTUAL');
    expect(result?.expectedSections).toEqual(['Security', 'Authentication']);
  });

  it('recovers from markdown-fenced JSON', async () => {
    (llmGateway.generate as jest.Mock).mockResolvedValue({ text: '```json\n{"intent": "COMPARATIVE"}\n```' });

    const result = await llmQueryEnhancerService.enhance('q', heuristicResult, 'user-1', 3000);

    expect(result?.intent).toBe('COMPARATIVE');
  });

  it('returns null (never throws) for malformed JSON', async () => {
    (llmGateway.generate as jest.Mock).mockResolvedValue({ text: 'not json' });

    const result = await llmQueryEnhancerService.enhance('q', heuristicResult, 'user-1', 3000);

    expect(result).toBeNull();
  });

  it('returns null (never throws) when the gateway rejects or times out', async () => {
    (llmGateway.generate as jest.Mock).mockRejectedValue(new Error('timeout'));

    const result = await llmQueryEnhancerService.enhance('q', heuristicResult, 'user-1', 3000);

    expect(result).toBeNull();
  });

  it('passes the configured timeoutMs through to the gateway request', async () => {
    (llmGateway.generate as jest.Mock).mockResolvedValue({ text: '{}' });

    await llmQueryEnhancerService.enhance('q', heuristicResult, 'user-1', 1234);

    expect(llmGateway.generate).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 1234 }));
  });
});
