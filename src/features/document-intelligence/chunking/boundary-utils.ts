// Natural-boundary heuristic (paragraph -> sentence -> whitespace) extracted from the proven
// implementation in worker/src/chunking/document.chunker.ts (WorkerDocumentChunker.findNaturalBoundary).
// Duplicated deliberately rather than imported: the worker's legacy chunker must stay byte-for-byte
// unmodified, and this module cannot depend on worker/src across the package boundary.
export function findNaturalBoundary(text: string): number {
  const lastParagraph = text.lastIndexOf('\n\n');
  if (lastParagraph !== -1) {
    return lastParagraph;
  }

  const sentenceMatches = Array.from(text.matchAll(/([.!?][ \n]|\n)/g));
  if (sentenceMatches.length > 0) {
    const lastMatch = sentenceMatches[sentenceMatches.length - 1];
    if (lastMatch && lastMatch.index !== undefined) {
      return lastMatch.index + lastMatch[0].length;
    }
  }

  const lastSpace = text.lastIndexOf(' ');
  if (lastSpace !== -1) {
    return lastSpace;
  }

  return text.length;
}

// pdfjs-dist text extraction (worker/src/parsers/pdf.parser.ts) joins text items with spaces,
// not newlines, so per-page text arrives as one continuous run with no reliable line/paragraph
// breaks. Sentence-level splitting on terminal punctuation is the only structural signal
// available in practice.
export function splitIntoSentenceLikeSegments(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const segments = trimmed.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/).map((s) => s.trim());
  return segments.filter((s) => s.length > 0);
}
