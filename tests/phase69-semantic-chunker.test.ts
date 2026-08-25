import { semanticChunkerService } from '@/features/document-intelligence/chunking/semantic-chunker.service';
import { LayoutBlock, ParsedDocumentLike } from '@/features/document-intelligence/document-intelligence.types';

describe('SemanticChunkerService — Phase 69A', () => {
  it('throws when maxTokens is not positive', () => {
    const doc: ParsedDocumentLike = { pageCount: 1, pages: [{ pageNumber: 1, text: 'hello' }] };
    expect(() => semanticChunkerService.chunk(doc, { maxTokens: 0, overlapTokens: 0 })).toThrow();
  });

  it('throws when overlapTokens is not strictly less than maxTokens', () => {
    const doc: ParsedDocumentLike = { pageCount: 1, pages: [{ pageNumber: 1, text: 'hello' }] };
    expect(() => semanticChunkerService.chunk(doc, { maxTokens: 100, overlapTokens: 100 })).toThrow();
  });

  it('falls back to raw page text as a single block when no layout blocks are provided', () => {
    const doc: ParsedDocumentLike = {
      pageCount: 1,
      pages: [{ pageNumber: 1, text: 'A short page of plain text with no structure.' }]
    };
    const chunks = semanticChunkerService.chunk(doc, { maxTokens: 500, overlapTokens: 50 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain('A short page of plain text');
    expect(chunks[0]?.metadata?.contentType).toBe('TEXT');
    expect(chunks[0]?.metadata?.chunkingStrategy).toBe('semantic');
  });

  it('keeps a heading glued to the paragraph that immediately follows it when both fit the budget', () => {
    const blocks: LayoutBlock[] = [
      { type: 'heading', text: 'Executive Summary', pageNumber: 1 },
      { type: 'paragraph', text: 'This report summarizes the quarterly results in a few sentences.', pageNumber: 1 }
    ];
    const doc: ParsedDocumentLike = { pageCount: 1, pages: [{ pageNumber: 1, text: '' }] };
    const chunks = semanticChunkerService.chunk(doc, { maxTokens: 500, overlapTokens: 50 }, blocks);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toContain('Executive Summary');
    expect(chunks[0]?.content).toContain('quarterly results');
    expect(chunks[0]?.metadata?.sectionTitle).toBe('Executive Summary');
  });

  it('splits an oversized block into multiple chunks, each bounded by maxTokens', () => {
    const longText = Array.from({ length: 400 }, (_, i) => `Sentence number ${i} in a very long block of text.`).join(' ');
    const blocks: LayoutBlock[] = [{ type: 'paragraph', text: longText, pageNumber: 1 }];
    const doc: ParsedDocumentLike = { pageCount: 1, pages: [{ pageNumber: 1, text: '' }] };
    const chunks = semanticChunkerService.chunk(doc, { maxTokens: 100, overlapTokens: 15 }, blocks);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(120);
    }
  });

  it('assigns sequential chunkIndex values across the whole document', () => {
    const doc: ParsedDocumentLike = {
      pageCount: 2,
      pages: [
        { pageNumber: 1, text: 'Page one content here.' },
        { pageNumber: 2, text: 'Page two content here.' }
      ]
    };
    const chunks = semanticChunkerService.chunk(doc, { maxTokens: 500, overlapTokens: 50 });
    expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, idx) => idx));
  });

  it('produces output structurally compatible with the worker Chunk shape', () => {
    const doc: ParsedDocumentLike = {
      pageCount: 1,
      pages: [{ pageNumber: 3, text: 'Some content on page three.' }]
    };
    const chunks = semanticChunkerService.chunk(doc, { maxTokens: 500, overlapTokens: 50 });
    expect(chunks[0]).toMatchObject({
      chunkIndex: 0,
      pageNumber: 3,
      content: expect.any(String),
      tokenCount: expect.any(Number)
    });
  });
});
