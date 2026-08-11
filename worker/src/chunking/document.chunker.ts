import { getEncoding } from 'js-tiktoken';
import { ParsedDocument } from '../parsers/pdf.parser.js';

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

export class WorkerDocumentChunker {
  private encoding = getEncoding('cl100k_base');

  public chunk(document: ParsedDocument, options?: DocumentChunkerOptions): Chunk[] {
    const chunkSize = options?.chunkSize ?? Number(process.env.DOCUMENT_CHUNK_SIZE || '800');
    const overlap = options?.chunkOverlap ?? Number(process.env.DOCUMENT_CHUNK_OVERLAP || '120');

    if (chunkSize <= 0) throw new Error('chunkSize must be greater than 0');
    if (overlap < 0 || overlap >= chunkSize) {
      throw new Error('chunkOverlap must be >= 0 and strictly less than chunkSize');
    }

    const chunks: Chunk[] = [];
    let globalChunkIndex = 0;

    for (const page of document.pages) {
      const trimmedText = page.text ? page.text.trim() : '';

      if (!trimmedText) {
        continue;
      }

      const pageTokens = this.encoding.encode(trimmedText);

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

      let startTokenIdx = 0;

      while (startTokenIdx < pageTokens.length) {
        const endTokenIdx = Math.min(startTokenIdx + chunkSize, pageTokens.length);
        const chunkTokenSlice = pageTokens.slice(startTokenIdx, endTokenIdx);
        const rawSliceText = this.encoding.decode(chunkTokenSlice);

        let finalChunkText = rawSliceText;
        let consumedTokens = chunkTokenSlice.length;

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

        const advanceAmount = Math.max(1, consumedTokens - overlap);
        startTokenIdx += advanceAmount;
      }
    }

    return chunks;
  }

  private findNaturalBoundary(text: string): number {
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
}

export const workerDocumentChunker = new WorkerDocumentChunker();
