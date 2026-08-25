import { sectionScoringService } from '@/features/rag/query-intelligence/section/section-scoring.service';

describe('SectionScoringService — Phase 69B', () => {
  it('scores a strong overlap between expected section and chunk sectionTitle highly', () => {
    const score = sectionScoringService.score(['security', 'authentication'], { sectionTitle: 'Security and Authentication Overview' });
    expect(score).toBeGreaterThan(0.2);
  });

  it('scores unrelated sections near zero', () => {
    const score = sectionScoringService.score(['pricing'], { sectionTitle: 'Executive Summary' });
    expect(score).toBe(0);
  });

  it('returns 0 (neutral, not a penalty) when the chunk has no sectionTitle at all', () => {
    expect(sectionScoringService.score(['security'], {})).toBe(0);
    expect(sectionScoringService.score(['security'], null)).toBe(0);
  });

  it('returns 0 when expectedSections is empty', () => {
    expect(sectionScoringService.score([], { sectionTitle: 'Security' })).toBe(0);
  });

  it('never throws on malformed metadata', () => {
    expect(() => sectionScoringService.score(['security'], { sectionTitle: 12345 as unknown as string })).not.toThrow();
  });
});
