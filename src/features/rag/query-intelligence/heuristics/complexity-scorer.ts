const QUESTION_WORDS = ['what', 'who', 'when', 'where', 'which', 'why', 'how'];
const BROAD_MARKERS = /\b(everything|all|entire|comprehensive|in general|overview)\b/i;
const AMBIGUOUS_SINGLE_WORD_MAX_LENGTH = 3;

export interface ComplexityScore {
  complexity: number; // 0-1
  isBroad: boolean;
  isAmbiguous: boolean;
}

/**
 * Word/clause/question-word based complexity heuristic. Pure, synchronous, never throws.
 */
export function scoreComplexity(question: string): ComplexityScore {
  const trimmed = (question || '').trim();
  if (!trimmed) {
    return { complexity: 0, isBroad: false, isAmbiguous: true };
  }

  try {
    const words = trimmed.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const clauseCount = (trimmed.match(/[,;]|(?:\band\b)|(?:\bor\b)/gi) || []).length;
    const questionWordCount = words.filter((w) => QUESTION_WORDS.includes(w.toLowerCase().replace(/[?.,]/g, ''))).length;

    const wordScore = Math.min(1, wordCount / 40);
    const clauseScore = Math.min(1, clauseCount / 4);
    const questionWordScore = Math.min(1, questionWordCount / 3);

    const complexity = Math.min(1, wordScore * 0.5 + clauseScore * 0.3 + questionWordScore * 0.2);
    const isBroad = BROAD_MARKERS.test(trimmed) || wordCount <= 4;
    const isAmbiguous = wordCount <= AMBIGUOUS_SINGLE_WORD_MAX_LENGTH;

    return { complexity, isBroad, isAmbiguous };
  } catch {
    return { complexity: 0, isBroad: false, isAmbiguous: false };
  }
}
