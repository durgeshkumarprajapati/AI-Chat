// Phase 88 Part B — N+1 fix regression for KnowledgeBaseRepository.findPaginatedByUser().
//
// Before this change: `kbs.map(async kb => this.getKnowledgeBaseStats(kb.id, userId))` fired 3
// queries (knowledgeBaseDocument.findMany + documentChunk.count + a raw embedded-count query)
// PER knowledge base returned on the page — up to 3 * pageSize queries for one list-page render.
//
// After this change: one batched `getStatsForKnowledgeBases()` call computes the exact same
// per-KB fields for the whole page in 3 total queries, regardless of page size.
//
// This test proves both halves: (1) the query COUNT collapses to one call per underlying query
// type no matter how many knowledge bases are on the page, and (2) the returned per-KB numeric
// fields are unchanged — hand-computed from the same mock rows using the exact formulas the old
// per-row `getKnowledgeBaseStats` used (status bucket counts, summed chunk/embedded counts).
jest.mock('@/lib/prisma', () => ({
  prisma: {
    knowledgeBase: {
      findMany: jest.fn(),
      count: jest.fn()
    },
    knowledgeBaseDocument: {
      findMany: jest.fn()
    },
    documentChunk: {
      groupBy: jest.fn()
    },
    $queryRaw: jest.fn()
  }
}));

import { prisma } from '@/lib/prisma';
import { knowledgeBaseRepository } from '@/features/knowledge-bases/repositories/knowledge-base.repository';

const kbRow = (id: string) => ({
  id,
  userId: 'user-1',
  name: `KB ${id}`,
  description: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z')
});

describe('Phase 88 — KnowledgeBaseRepository.findPaginatedByUser N+1 fix', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('issues exactly one batched query per underlying query type for a 3-knowledge-base page (not 3 queries PER kb)', async () => {
    (prisma.knowledgeBase.findMany as jest.Mock).mockResolvedValue([kbRow('kb1'), kbRow('kb2'), kbRow('kb3')]);
    (prisma.knowledgeBase.count as jest.Mock).mockResolvedValue(3);

    (prisma.knowledgeBaseDocument.findMany as jest.Mock).mockResolvedValue([
      { knowledgeBaseId: 'kb1', document: { id: 'doc1', status: 'COMPLETED' } },
      { knowledgeBaseId: 'kb1', document: { id: 'doc2', status: 'PROCESSING' } },
      { knowledgeBaseId: 'kb2', document: { id: 'doc3', status: 'FAILED' } }
      // kb3 has no member documents at all.
    ]);

    (prisma.documentChunk.groupBy as jest.Mock).mockResolvedValue([
      { documentId: 'doc1', _count: { _all: 5 } },
      { documentId: 'doc2', _count: { _all: 3 } },
      { documentId: 'doc3', _count: { _all: 2 } }
    ]);

    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      { document_id: 'doc1', count: BigInt(4) },
      { document_id: 'doc2', count: BigInt(1) }
      // doc3 has zero embedded chunks -> intentionally absent from the raw result set.
    ]);

    const result = await knowledgeBaseRepository.findPaginatedByUser('user-1', {});

    // The N+1 fix: exactly one call to each underlying query, regardless of the 3 KBs on the page.
    expect(prisma.knowledgeBaseDocument.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.documentChunk.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);

    // The one batched findMany call covers all 3 KB ids in a single `in` filter.
    const findManyArgs = (prisma.knowledgeBaseDocument.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyArgs.where.knowledgeBaseId.in.sort()).toEqual(['kb1', 'kb2', 'kb3']);

    // Returned per-KB stats are unchanged from what the old per-row getKnowledgeBaseStats() would
    // have computed for the same underlying rows.
    const byId = Object.fromEntries(result.items.map((item) => [item.id, item]));

    expect(byId.kb1).toEqual(
      expect.objectContaining({
        documentCount: 2,
        completedDocuments: 1,
        processingDocuments: 1,
        failedDocuments: 0,
        totalChunks: 8, // 5 (doc1) + 3 (doc2)
        embeddedChunks: 5 // 4 (doc1) + 1 (doc2)
      })
    );
    expect(byId.kb2).toEqual(
      expect.objectContaining({
        documentCount: 1,
        completedDocuments: 0,
        processingDocuments: 0,
        failedDocuments: 1,
        totalChunks: 2,
        embeddedChunks: 0
      })
    );
    expect(byId.kb3).toEqual(
      expect.objectContaining({
        documentCount: 0,
        completedDocuments: 0,
        processingDocuments: 0,
        failedDocuments: 0,
        totalChunks: 0,
        embeddedChunks: 0
      })
    );

    expect(result.total).toBe(3);
  });

  it('skips the chunk-count queries entirely when the page has zero member documents across all KBs', async () => {
    (prisma.knowledgeBase.findMany as jest.Mock).mockResolvedValue([kbRow('kb1')]);
    (prisma.knowledgeBase.count as jest.Mock).mockResolvedValue(1);
    (prisma.knowledgeBaseDocument.findMany as jest.Mock).mockResolvedValue([]);

    const result = await knowledgeBaseRepository.findPaginatedByUser('user-1', {});

    expect(prisma.documentChunk.groupBy).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(result.items[0]).toEqual(
      expect.objectContaining({ documentCount: 0, totalChunks: 0, embeddedChunks: 0 })
    );
  });

  it('returns an empty page (no queries beyond the two Promise.all lookups) when there are no knowledge bases at all', async () => {
    (prisma.knowledgeBase.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.knowledgeBase.count as jest.Mock).mockResolvedValue(0);

    const result = await knowledgeBaseRepository.findPaginatedByUser('user-1', {});

    expect(prisma.knowledgeBaseDocument.findMany).not.toHaveBeenCalled();
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});
