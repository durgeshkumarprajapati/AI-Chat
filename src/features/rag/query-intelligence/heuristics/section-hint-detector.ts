const SECTION_KEYWORDS = [
  'introduction',
  'conclusion',
  'summary',
  'methodology',
  'results',
  'discussion',
  'background',
  'overview',
  'security',
  'authentication',
  'pricing',
  'terms',
  'scope',
  'requirements',
  'appendix',
  'references'
];

/**
 * Regex-based section-hint detection over the question text. Pure, synchronous, never throws.
 * Returns [] when no known section keyword appears — a neutral "no signal" result, not a guess.
 */
export function detectSectionHints(question: string): string[] {
  if (!question || !question.trim()) return [];

  try {
    const lower = question.toLowerCase();
    const hints: string[] = [];
    for (const keyword of SECTION_KEYWORDS) {
      if (lower.includes(keyword)) {
        hints.push(keyword);
      }
    }
    // Also capture an explicit "<word> section" phrase not already in the fixed keyword list.
    const explicitSectionMatch = lower.match(/\b([a-z][a-z\s]{2,30}?)\s+section\b/);
    if (explicitSectionMatch?.[1]) {
      const phrase = explicitSectionMatch[1].trim();
      if (phrase && !hints.includes(phrase)) {
        hints.push(phrase);
      }
    }
    return hints;
  } catch {
    return [];
  }
}
