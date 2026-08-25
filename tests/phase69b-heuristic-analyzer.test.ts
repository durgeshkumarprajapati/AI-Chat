import { heuristicAnalyzerService } from '@/features/rag/query-intelligence/heuristics/heuristic-analyzer.service';
import { classifyIntent } from '@/features/rag/query-intelligence/heuristics/intent-classifier';
import { detectDocumentTypeHints } from '@/features/rag/query-intelligence/heuristics/doctype-hint-detector';
import { detectSectionHints } from '@/features/rag/query-intelligence/heuristics/section-hint-detector';
import { scoreComplexity } from '@/features/rag/query-intelligence/heuristics/complexity-scorer';

describe('HeuristicAnalyzerService — Phase 69B', () => {
  it('classifies table-lookup questions', () => {
    expect(classifyIntent('What are the values in the table on page 3?')).toBe('TABLE_LOOKUP');
  });

  it('classifies chart-lookup questions', () => {
    expect(classifyIntent('What does the revenue chart show?')).toBe('CHART_LOOKUP');
  });

  it('classifies comparative questions', () => {
    expect(classifyIntent('Compare Q1 revenue versus Q2 revenue')).toBe('COMPARATIVE');
  });

  it('classifies factual questions via leading question word', () => {
    expect(classifyIntent('What are the OAuth security requirements?')).toBe('FACTUAL');
  });

  it('returns UNKNOWN for empty input without throwing', () => {
    expect(classifyIntent('')).toBe('UNKNOWN');
    expect(() => classifyIntent(undefined as unknown as string)).not.toThrow();
  });

  it('detects document type hints from keywords', () => {
    expect(detectDocumentTypeHints('What is the total due on this invoice?')).toContain('INVOICE');
    expect(detectDocumentTypeHints('a completely unrelated sentence')).toEqual([]);
  });

  it('detects section hints from known keywords and explicit "X section" phrasing', () => {
    expect(detectSectionHints('What does the Security section say about tokens?')).toContain('security');
    expect(detectSectionHints('no section keyword here at all')).toEqual([]);
  });

  it('scores complexity boundedly between 0 and 1', () => {
    const short = scoreComplexity('revenue');
    const long = scoreComplexity(
      'Can you explain, in detail, how the authentication flow works, and also how it relates to the authorization and session management systems?'
    );
    expect(short.complexity).toBeGreaterThanOrEqual(0);
    expect(long.complexity).toBeLessThanOrEqual(1);
    expect(long.complexity).toBeGreaterThan(short.complexity);
  });

  it('composes a full result and never throws, even for garbage input', () => {
    const result = heuristicAnalyzerService.analyze('What are the OAuth security requirements?');
    expect(result.source).toBe('heuristic');
    expect(result.intent).toBe('FACTUAL');
    expect(result.analysisMs).toBeGreaterThanOrEqual(0);

    expect(() => heuristicAnalyzerService.analyze(null as unknown as string)).not.toThrow();
  });
});
