import { strategySelectorService } from '@/features/rag/query-intelligence/strategy/strategy-selector.service';

describe('StrategySelectorService — Phase 69B', () => {
  it('leaves weights unchanged for FACTUAL/NARROW_LOOKUP intents', () => {
    const result = strategySelectorService.selectStrategy('FACTUAL', 0.7, 0.3);
    expect(result).toEqual({ vectorWeight: 0.7, keywordWeight: 0.3, graphPriority: false });
  });

  it('shifts weight toward keyword for COMPARATIVE/TABLE_LOOKUP intents', () => {
    const result = strategySelectorService.selectStrategy('TABLE_LOOKUP', 0.7, 0.3);
    expect(result.keywordWeight).toBeGreaterThan(0.3);
    expect(result.vectorWeight).toBeLessThan(0.7);
  });

  it('shifts weight toward vector and sets graphPriority for broad/summarization intents', () => {
    const result = strategySelectorService.selectStrategy('BROAD_EXPLORATION', 0.7, 0.3);
    expect(result.vectorWeight).toBeGreaterThan(0.7);
    expect(result.graphPriority).toBe(true);
  });

  it('graphPriority is documented as a no-op placeholder — it never throws and is a plain boolean', () => {
    const result = strategySelectorService.selectStrategy('SUMMARIZATION', 0.7, 0.3);
    expect(typeof result.graphPriority).toBe('boolean');
  });

  it('falls back to unchanged weights for UNKNOWN intent', () => {
    const result = strategySelectorService.selectStrategy('UNKNOWN', 0.7, 0.3);
    expect(result).toEqual({ vectorWeight: 0.7, keywordWeight: 0.3, graphPriority: false });
  });
});
