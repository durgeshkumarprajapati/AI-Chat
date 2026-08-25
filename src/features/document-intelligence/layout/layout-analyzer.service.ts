import { LayoutBlock, ParsedDocumentLike } from '../document-intelligence.types';
import { splitIntoSentenceLikeSegments } from '../chunking/boundary-utils';

const HEADING_MAX_LENGTH = 80;

const HEADING_PATTERNS = [
  /^(chapter|section|part|appendix)\s+[\divxlc]+/i,
  /^\d+(\.\d+)*\.?\s+[A-Z]/,
  /^[A-Z][A-Z0-9 ,'&-]{3,}$/
];

const LIST_ITEM_PATTERN = /^([-*•‣▪]|\d+[.)]|\([a-zA-Z0-9]+\))\s+/;

function looksLikeHeading(segment: string): boolean {
  const s = segment.trim();
  if (!s || s.length > HEADING_MAX_LENGTH) return false;
  if (HEADING_PATTERNS.some((p) => p.test(s))) return true;

  if (/[.!?]$/.test(s)) return false;

  const words = s.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 12) return false;

  const capitalizedWords = words.filter((w) => /^[A-Z0-9]/.test(w));
  return capitalizedWords.length / words.length >= 0.7;
}

function looksLikeListItem(segment: string): boolean {
  return LIST_ITEM_PATTERN.test(segment.trim());
}

/**
 * Text-pattern layout segmentation over already-extracted page text. This is NOT true visual
 * layout analysis: the PDF text extractor (worker/src/parsers/pdf.parser.ts) has no bounding-box
 * or font-geometry information, so heading/list/paragraph detection here is heuristic, operating
 * on sentence-like segments rather than line breaks (which the extractor does not preserve).
 */
export class LayoutAnalyzerService {
  public analyze(document: ParsedDocumentLike): LayoutBlock[] {
    const blocks: LayoutBlock[] = [];

    for (const page of document.pages) {
      if (!page.text || !page.text.trim()) continue;

      let segments: string[];
      try {
        segments = splitIntoSentenceLikeSegments(page.text);
      } catch {
        segments = [page.text.trim()];
      }

      let paragraphBuffer: string[] = [];
      const flushParagraph = () => {
        if (paragraphBuffer.length > 0) {
          blocks.push({ type: 'paragraph', text: paragraphBuffer.join(' '), pageNumber: page.pageNumber });
          paragraphBuffer = [];
        }
      };

      for (const segment of segments) {
        if (!segment) continue;

        try {
          if (looksLikeHeading(segment)) {
            flushParagraph();
            blocks.push({ type: 'heading', text: segment, pageNumber: page.pageNumber });
          } else if (looksLikeListItem(segment)) {
            flushParagraph();
            blocks.push({ type: 'list', text: segment, pageNumber: page.pageNumber });
          } else {
            paragraphBuffer.push(segment);
          }
        } catch {
          paragraphBuffer.push(segment);
        }
      }

      flushParagraph();
    }

    return blocks;
  }
}

export const layoutAnalyzerService = new LayoutAnalyzerService();
