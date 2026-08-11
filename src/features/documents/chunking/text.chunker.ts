import { ExtractedPage } from '../parsers/pdf.parser';

export interface Chunk {
  chunkIndex: number;
  content: string;
  pageNumber: number;
  tokenCount: number;
  metadata?: Record<string, unknown>;
}

export class TextChunker {
  public chunkDocumentPages(
    pages: ExtractedPage[],
    _options?: { chunkSize?: number; chunkOverlap?: number }
  ): Chunk[] {
    // Placeholder chunking algorithm interface
    // Will be fully implemented in the next phase
    const chunks: Chunk[] = [];
    let index = 0;

    for (const page of pages) {
      chunks.push({
        chunkIndex: index++,
        content: page.text,
        pageNumber: page.pageNumber,
        tokenCount: Math.ceil(page.text.length / 4),
        metadata: { source: 'pdf' }
      });
    }

    return chunks;
  }
}

export const textChunker = new TextChunker();
