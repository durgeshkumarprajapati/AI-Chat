import { layoutAnalyzerService } from '@/features/document-intelligence/layout/layout-analyzer.service';
import { ParsedDocumentLike } from '@/features/document-intelligence/document-intelligence.types';

describe('LayoutAnalyzerService — Phase 69A', () => {
  it('classifies a standalone ALL-CAPS heading with no body text', () => {
    const doc: ParsedDocumentLike = { pageCount: 1, pages: [{ pageNumber: 1, text: 'EXECUTIVE SUMMARY' }] };
    const blocks = layoutAnalyzerService.analyze(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe('heading');
  });

  it('classifies a standalone short Title Case phrase with no terminal punctuation as a heading', () => {
    const doc: ParsedDocumentLike = { pageCount: 1, pages: [{ pageNumber: 1, text: 'Quarterly Financial Report' }] };
    const blocks = layoutAnalyzerService.analyze(doc);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe('heading');
  });

  it('classifies ordinary multi-sentence prose as paragraph blocks, not headings', () => {
    const doc: ParsedDocumentLike = {
      pageCount: 1,
      pages: [
        {
          pageNumber: 1,
          text: 'This report presents the quarterly results in detail. It continues with further explanation afterward.'
        }
      ]
    };
    const blocks = layoutAnalyzerService.analyze(doc);
    expect(blocks.every((b) => b.type === 'paragraph')).toBe(true);
  });

  it('classifies bullet-prefixed text as a list block', () => {
    const doc: ParsedDocumentLike = {
      pageCount: 1,
      pages: [{ pageNumber: 1, text: '- Item one here. - Item two here. - Item three here.' }]
    };
    const blocks = layoutAnalyzerService.analyze(doc);
    expect(blocks.some((b) => b.type === 'list')).toBe(true);
  });

  it('never throws on empty, whitespace-only, or missing page text', () => {
    expect(() =>
      layoutAnalyzerService.analyze({
        pageCount: 2,
        pages: [
          { pageNumber: 1, text: '' },
          { pageNumber: 2, text: '   ' }
        ]
      })
    ).not.toThrow();

    expect(layoutAnalyzerService.analyze({ pageCount: 0, pages: [] })).toEqual([]);
  });

  it('preserves page numbers on every produced block', () => {
    const doc: ParsedDocumentLike = {
      pageCount: 2,
      pages: [
        { pageNumber: 1, text: 'EXECUTIVE SUMMARY' },
        { pageNumber: 2, text: 'This is a normal paragraph sentence on the second page.' }
      ]
    };
    const blocks = layoutAnalyzerService.analyze(doc);
    expect(blocks.some((b) => b.pageNumber === 1)).toBe(true);
    expect(blocks.some((b) => b.pageNumber === 2)).toBe(true);
  });
});
