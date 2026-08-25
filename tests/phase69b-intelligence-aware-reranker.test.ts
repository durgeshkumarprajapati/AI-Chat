import { IntelligenceAwareReranker } from '@/features/rag/query-intelligence/reranking/intelligence-aware-reranker';
import { RetrievedChunk } from '@/features/rag/retrieval/retrieval.types';

function buildChunk(overrides: Partial<RetrievedChunk> = {}): RetrievedChunk {
  return {
    id: 'chunk-1',
    documentId: 'doc-1',
    filename: 'file.pdf',
    chunkIndex: 0,
    pageNumber: 1,
    content: 'some content about revenue',
    tokenCount: 10,
    similarity: 0.5,
    hybridScore: 0.5,
    metadata: {},
    ...overrides
  };
}

describe('IntelligenceAwareReranker — Phase 69B', () => {
  it('never lowers a chunk below the base reranker score for a neutral (empty) context', () => {
    const base = { rerank: jest.fn((_q: string, c: RetrievedChunk[]) => c.map((chunk) => ({ ...chunk, rerankScore: 0.5 }))) };
    const decorator = new IntelligenceAwareReranker(base);

    const results = decorator.rerank('revenue', [buildChunk()]);

    expect(results[0]!.rerankScore).toBeGreaterThanOrEqual(0.5);
  });

  it('boosts a chunk whose documentType matches an expected document type', () => {
    const base = { rerank: jest.fn((_q: string, c: RetrievedChunk[]) => c.map((chunk) => ({ ...chunk, rerankScore: 0.5 }))) };
    const decoratorWithMatch = new IntelligenceAwareReranker(base, {
      expectedDocumentTypes: ['REPORT'],
      expectedSections: [],
      boostDocumentIds: [],
      isTableOrChartQuery: false
    });
    const decoratorNoMatch = new IntelligenceAwareReranker(base, {
      expectedDocumentTypes: [],
      expectedSections: [],
      boostDocumentIds: [],
      isTableOrChartQuery: false
    });

    const chunk = buildChunk({ metadata: { documentType: 'REPORT' } });
    const withMatch = decoratorWithMatch.rerank('q', [chunk])[0];
    const noMatch = decoratorNoMatch.rerank('q', [chunk])[0];

    expect(withMatch!.rerankScore).toBeGreaterThan(noMatch!.rerankScore ?? 0);
  });

  it('boosts TABLE/CHART content-type chunks only for table-or-chart queries', () => {
    const base = { rerank: jest.fn((_q: string, c: RetrievedChunk[]) => c.map((chunk) => ({ ...chunk, rerankScore: 0.5 }))) };
    const tableChunk = buildChunk({ metadata: { contentType: 'TABLE' } });

    const withTableQuery = new IntelligenceAwareReranker(base, {
      expectedDocumentTypes: [],
      expectedSections: [],
      boostDocumentIds: [],
      isTableOrChartQuery: true
    }).rerank('q', [tableChunk])[0];

    const withoutTableQuery = new IntelligenceAwareReranker(base, {
      expectedDocumentTypes: [],
      expectedSections: [],
      boostDocumentIds: [],
      isTableOrChartQuery: false
    }).rerank('q', [tableChunk])[0];

    expect(withTableQuery!.rerankScore).toBeGreaterThan(withoutTableQuery!.rerankScore ?? 0);
  });

  it('never mutates the base reranker output objects in place', () => {
    const originalChunk = buildChunk();
    const base = { rerank: jest.fn((_q: string, c: RetrievedChunk[]) => c) };
    const decorator = new IntelligenceAwareReranker(base);

    decorator.rerank('q', [originalChunk]);

    expect(originalChunk.rerankScore).toBeUndefined();
  });

  it('caps the final score at 1.0', () => {
    const base = { rerank: jest.fn((_q: string, c: RetrievedChunk[]) => c.map((chunk) => ({ ...chunk, rerankScore: 0.99 }))) };
    const decorator = new IntelligenceAwareReranker(base, {
      expectedDocumentTypes: ['REPORT'],
      expectedSections: ['security'],
      boostDocumentIds: ['doc-1'],
      isTableOrChartQuery: true
    });

    const result = decorator.rerank('q', [
      buildChunk({ metadata: { documentType: 'REPORT', contentType: 'TABLE', sectionTitle: 'Security Overview' } })
    ])[0];

    expect(result!.rerankScore).toBeLessThanOrEqual(1.0);
  });
});
