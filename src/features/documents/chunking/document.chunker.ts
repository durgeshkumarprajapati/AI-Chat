import { getEncoding } from 'js-tiktoken';
import { ParsedDocument } from '../parsers/pdf.parser';
import { env } from '@/config/env';

export type Chunk = {
  chunkIndex: number;
  pageNumber: number;
  content: string;
  tokenCount: number;
  metadata?: Record<string, unknown>;
};

export interface DocumentChunkerOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

export interface IDocumentChunker {
  chunk(_document: ParsedDocument, _options?: DocumentChunkerOptions): Chunk[];
}

export class DocumentChunker implements IDocumentChunker {
  private encoding = getEncoding('cl100k_base');

  public chunk(document: ParsedDocument, options?: DocumentChunkerOptions): Chunk[] {
    const defaultChunkSize = env.server?.DOCUMENT_CHUNK_SIZE || process.env.DOCUMENT_CHUNK_SIZE
      ? Number(process.env.DOCUMENT_CHUNK_SIZE)
      : 800;
    const defaultOverlap = env.server?.DOCUMENT_CHUNK_OVERLAP || process.env.DOCUMENT_CHUNK_OVERLAP
      ? Number(process.env.DOCUMENT_CHUNK_OVERLAP)
      : 120;

    const chunkSize = options?.chunkSize ?? defaultChunkSize;
    const overlap = options?.chunkOverlap ?? defaultOverlap;

    if (chunkSize <= 0) throw new Error('chunkSize must be greater than 0');
    if (overlap < 0 || overlap >= chunkSize) {
      throw new Error('chunkOverlap must be >= 0 and strictly less than chunkSize');
    }

    const chunks: Chunk[] = [];
    let globalChunkIndex = 0;

    for (const page of document.pages) {
      const trimmedText = page.text ? page.text.trim() : '';

      // Skip empty or whitespace-only pages
      if (!trimmedText) {
        continue;
      }

      const pageTokens = this.encoding.encode(trimmedText);

      // Small page: fits in a single chunk
      if (pageTokens.length <= chunkSize) {
        chunks.push({
          chunkIndex: globalChunkIndex++,
          pageNumber: page.pageNumber,
          content: trimmedText,
          tokenCount: pageTokens.length,
          metadata: {
            source: 'pdf',
            pageNumber: page.pageNumber
          }
        });
        continue;
      }

      // Large page: split page content using token-aware chunking with natural boundary preference
      let startTokenIdx = 0;

      while (startTokenIdx < pageTokens.length) {
        const endTokenIdx = Math.min(startTokenIdx + chunkSize, pageTokens.length);
        const chunkTokenSlice = pageTokens.slice(startTokenIdx, endTokenIdx);
        const rawSliceText = this.encoding.decode(chunkTokenSlice);

        let finalChunkText = rawSliceText;
        let consumedTokens = chunkTokenSlice.length;

        // Try natural boundary split if this is not the final slice of the page
        if (endTokenIdx < pageTokens.length) {
          const cutIdx = this.findNaturalBoundary(rawSliceText);

          if (cutIdx > Math.floor(rawSliceText.length * 0.4)) {
            const candidateText = rawSliceText.slice(0, cutIdx).trim();
            const candidateTokens = this.encoding.encode(candidateText);

            if (candidateTokens.length > 0) {
              finalChunkText = candidateText;
              consumedTokens = candidateTokens.length;
            }
          }
        }

        finalChunkText = finalChunkText.trim();
        const actualChunkTokens = this.encoding.encode(finalChunkText);

        if (finalChunkText.length > 0) {
          chunks.push({
            chunkIndex: globalChunkIndex++,
            pageNumber: page.pageNumber,
            content: finalChunkText,
            tokenCount: actualChunkTokens.length,
            metadata: {
              source: 'pdf',
              pageNumber: page.pageNumber
            }
          });
        }

        // Advance startTokenIdx with token overlap
        const advanceAmount = Math.max(1, consumedTokens - overlap);
        startTokenIdx += advanceAmount;
      }
    }

    return chunks;
  }

  /**
   * Finds the best natural boundary index in text following hierarchy:
   * 1. Paragraph boundary (\n\n)
   * 2. Sentence boundary (. , ? , ! , \n)
   * 3. Space boundary (' ')
   */
  private findNaturalBoundary(text: string): number {
    // 1. Paragraph break
    const lastParagraph = text.lastIndexOf('\n\n');
    if (lastParagraph !== -1) {
      return lastParagraph;
    }

    // 2. Sentence end (. , ! , ? followed by space/newline, or newline)
    const sentenceMatches = Array.from(text.matchAll(/([.!?][ \n]|\n)/g));
    if (sentenceMatches.length > 0) {
      const lastMatch = sentenceMatches[sentenceMatches.length - 1];
      if (lastMatch && lastMatch.index !== undefined) {
        return lastMatch.index + lastMatch[0].length;
      }
    }

    // 3. Last whitespace
    const lastSpace = text.lastIndexOf(' ');
    if (lastSpace !== -1) {
      return lastSpace;
    }

    return text.length;
  }
}

export const documentChunker = new DocumentChunker();
