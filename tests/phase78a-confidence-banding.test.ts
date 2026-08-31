import {
  scoreToConfidenceBand,
  coarseApproxLabel,
  evaluateConfidence,
  blendConfidence,
  clampScore
} from '@/features/knowledge-intelligence/confidence.util';

describe('Phase 78A — confidence banding', () => {
  it('bands scores per the documented thresholds: LOW < 0.5, MEDIUM 0.5-0.75, HIGH > 0.75', () => {
    expect(scoreToConfidenceBand(0)).toBe('LOW');
    expect(scoreToConfidenceBand(0.49)).toBe('LOW');
    expect(scoreToConfidenceBand(0.5)).toBe('MEDIUM');
    expect(scoreToConfidenceBand(0.75)).toBe('MEDIUM');
    expect(scoreToConfidenceBand(0.751)).toBe('HIGH');
    expect(scoreToConfidenceBand(1)).toBe('HIGH');
  });

  it('clamps out-of-range and non-finite scores before banding', () => {
    expect(scoreToConfidenceBand(-5)).toBe('LOW');
    expect(scoreToConfidenceBand(5)).toBe('HIGH');
    expect(scoreToConfidenceBand(NaN)).toBe('LOW');
    expect(clampScore(Infinity)).toBe(1);
    expect(clampScore(-Infinity)).toBe(0);
  });

  it('never produces a fake-precision numeric string — only a coarse, one-decimal approximation', () => {
    const label = coarseApproxLabel(0.8234567);
    expect(label).toBe('approx. 0.8');
    expect(label).not.toMatch(/\d\.\d{2,}/);
    expect(coarseApproxLabel(0.041)).toBe('approx. 0.0');
  });

  it('evaluateConfidence bundles score/band/factors/approxLabel consistently', () => {
    const result = evaluateConfidence(0.82, ['signal A', 'signal B']);
    expect(result.band).toBe('HIGH');
    expect(result.factors).toEqual(['signal A', 'signal B']);
    expect(result.approxLabel).toBe('approx. 0.8');
    expect(result.score).toBeCloseTo(0.82);
  });

  it('blendConfidence produces a correctly-weighted, clamped average', () => {
    expect(blendConfidence(1, 1, 0, 1)).toBeCloseTo(0.5);
    expect(blendConfidence(0.8, 0.4, 0.9, 0.6)).toBeCloseTo(0.86);
    expect(blendConfidence(2, 1, 2, 1)).toBe(1); // inputs clamped before blending
    expect(blendConfidence(0.5, 0, 0.5, 0)).toBe(0); // zero total weight is handled, not NaN/divide-by-zero
  });
});
