jest.mock('@/lib/prisma', () => ({
  prisma: { documentIntelligence: { findMany: jest.fn() } }
}));

import { prisma } from '@/lib/prisma';
import { documentRoutingService } from '@/features/rag/query-intelligence/routing/document-routing.service';
import { QueryIntelligenceResult } from '@/features/rag/query-intelligence/query-intelligence.types';

function buildAnalysis(overrides: Partial<QueryIntelligenceResult> = {}): QueryIntelligenceResult {
  return {
    intent: 'FACTUAL',
    expectedDocumentTypes: ['REPORT'],
    expectedSections: [],
    isBroad: false,
    isAmbiguous: false,
    isTableOrChartQuery: false,
    complexity: 0.2,
    retrievalStrategy: 'BALANCED',
    source: 'heuristic',
    analysisMs: 1,
    cacheHit: false,
    ...overrides
  };
}

describe('DocumentRoutingService — Phase 69B', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns LOW confidence with no expected document types', async () => {
    const result = await documentRoutingService.route('user-1', buildAnalysis({ expectedDocumentTypes: [] }));
    expect(result.confidence).toBe('LOW');
    expect(prisma.documentIntelligence.findMany).not.toHaveBeenCalled();
  });

  it('returns LOW confidence when no documents match', async () => {
    (prisma.documentIntelligence.findMany as jest.Mock).mockResolvedValue([]);
    const result = await documentRoutingService.route('user-1', buildAnalysis());
    expect(result.confidence).toBe('LOW');
    expect(result.candidateDocumentIds).toEqual([]);
  });

  it('returns HIGH confidence with a small, specific match set', async () => {
    (prisma.documentIntelligence.findMany as jest.Mock).mockResolvedValue([{ documentId: 'doc-1' }, { documentId: 'doc-2' }]);
    const result = await documentRoutingService.route('user-1', buildAnalysis());
    expect(result.confidence).toBe('HIGH');
    expect(result.candidateDocumentIds).toEqual(['doc-1', 'doc-2']);
  });

  it('returns MEDIUM confidence (boost only, no filter) when matches are too broad', async () => {
    const manyMatches = Array.from({ length: 30 }, (_, i) => ({ documentId: `doc-${i}` }));
    (prisma.documentIntelligence.findMany as jest.Mock).mockResolvedValue(manyMatches);
    const result = await documentRoutingService.route('user-1', buildAnalysis());
    expect(result.confidence).toBe('MEDIUM');
    expect(result.candidateDocumentIds).toEqual([]);
    expect(result.boostDocumentIds.length).toBe(30);
  });

  it('never throws and returns LOW confidence when the lookup itself fails', async () => {
    (prisma.documentIntelligence.findMany as jest.Mock).mockRejectedValue(new Error('db down'));
    await expect(documentRoutingService.route('user-1', buildAnalysis())).resolves.toEqual({
      confidence: 'LOW',
      candidateDocumentIds: [],
      boostDocumentIds: []
    });
  });
});
