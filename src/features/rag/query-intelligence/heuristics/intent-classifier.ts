import { QueryIntent } from '../query-intelligence.types';

const RULES: Array<{ intent: QueryIntent; pattern: RegExp }> = [
  { intent: 'TABLE_LOOKUP', pattern: /\b(table|row|column|spreadsheet|line item|total (?:of|for)|figures? in the table)\b/i },
  { intent: 'CHART_LOOKUP', pattern: /\b(chart|graph|plot|diagram|trend line|figure \d+)\b/i },
  { intent: 'COMPARATIVE', pattern: /\b(compare|versus|vs\.?|difference between|which is (?:better|higher|lower)|more than|less than)\b/i },
  { intent: 'SUMMARIZATION', pattern: /\b(summarize|summary|overview|tl;?dr|in short|briefly)\b/i },
  { intent: 'PROCEDURAL', pattern: /\b(how (?:do|to|can) i|steps? to|process for|guide to)\b/i },
  { intent: 'BROAD_EXPLORATION', pattern: /\b(everything about|all information|tell me about|what is .* in general)\b/i },
  { intent: 'NARROW_LOOKUP', pattern: /\b(exact|specific|precise|the exact value of)\b/i }
];

const FACTUAL_QUESTION_WORDS = /^(what|who|when|where|which)\b/i;

/**
 * Deterministic regex/keyword rules → QueryIntent. Pure, synchronous, never throws.
 */
export function classifyIntent(question: string): QueryIntent {
  if (!question || !question.trim()) return 'UNKNOWN';

  try {
    for (const rule of RULES) {
      if (rule.pattern.test(question)) {
        return rule.intent;
      }
    }
    if (FACTUAL_QUESTION_WORDS.test(question.trim())) {
      return 'FACTUAL';
    }
    return 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}
