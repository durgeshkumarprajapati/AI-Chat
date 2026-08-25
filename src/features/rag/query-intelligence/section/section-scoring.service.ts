export class SectionScoringService {
  /**
   * Case-insensitive token-overlap (Jaccard-style) fuzzy match between a query's expected
   * sections and a chunk's `metadata.sectionTitle` (written by the 69A semantic chunker).
   * Returns 0 (neutral, never a penalty) when either side has no signal — chunks with no
   * `sectionTitle` (legacy chunker, or semantic chunking disabled) always score 0 here.
   */
  public score(expectedSections: string[], chunkMetadata: Record<string, unknown> | null | undefined): number {
    try {
      const sectionTitle = chunkMetadata?.sectionTitle;
      if (!expectedSections.length || typeof sectionTitle !== 'string' || !sectionTitle.trim()) {
        return 0;
      }

      const titleTokens = new Set(this.tokenize(sectionTitle));
      if (titleTokens.size === 0) return 0;

      let best = 0;
      for (const expected of expectedSections) {
        const expectedTokens = new Set(this.tokenize(expected));
        if (expectedTokens.size === 0) continue;
        const overlap = [...expectedTokens].filter((t) => titleTokens.has(t)).length;
        const union = new Set([...expectedTokens, ...titleTokens]).size || 1;
        best = Math.max(best, overlap / union);
      }
      return best;
    } catch {
      return 0;
    }
  }

  private tokenize(s: string): string[] {
    return s
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 2);
  }
}

export const sectionScoringService = new SectionScoringService();
