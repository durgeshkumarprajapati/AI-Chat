import { dynamicTopKService } from '@/features/rag/query-intelligence/strategy/dynamic-topk.service';

const bounds = { minCandidateK: 10, maxCandidateK: 40, minFinalK: 5, maxFinalK: 15 };

describe('DynamicTopKService — Phase 69B', () => {
  it('never exceeds the configured bounds for extreme complexity/broad/ambiguous inputs', () => {
    const result = dynamicTopKService.compute(1, true, true, bounds, 20, 20, 5);
    expect(result.candidateK).toBeLessThanOrEqual(bounds.maxCandidateK);
    expect(result.candidateK).toBeGreaterThanOrEqual(bounds.minCandidateK);
    expect(result.finalK).toBeLessThanOrEqual(bounds.maxFinalK);
    expect(result.finalK).toBeGreaterThanOrEqual(bounds.minFinalK);
  });

  it('never goes below the configured bounds for minimal complexity', () => {
    const result = dynamicTopKService.compute(0, false, false, bounds, 1, 1, 1);
    expect(result.candidateK).toBeGreaterThanOrEqual(bounds.minCandidateK);
    expect(result.finalK).toBeGreaterThanOrEqual(bounds.minFinalK);
  });

  it('increases K monotonically as complexity increases', () => {
    const low = dynamicTopKService.compute(0.1, false, false, bounds, 20, 20, 5);
    const high = dynamicTopKService.compute(0.9, false, false, bounds, 20, 20, 5);
    expect(high.candidateK).toBeGreaterThanOrEqual(low.candidateK);
    expect(high.finalK).toBeGreaterThanOrEqual(low.finalK);
  });

  it('never throws for degenerate bounds', () => {
    expect(() => dynamicTopKService.compute(0.5, true, true, { minCandidateK: 5, maxCandidateK: 5, minFinalK: 5, maxFinalK: 5 }, 20, 20, 5)).not.toThrow();
  });
});
