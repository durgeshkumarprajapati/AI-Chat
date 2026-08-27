jest.mock('@/lib/prisma', () => ({
  prisma: { document: { findFirst: jest.fn() }, documentChunk: { count: jest.fn().mockResolvedValue(1) } }
}));

import { prisma } from '@/lib/prisma';
import { citationService } from '@/features/rag/citation/citation.service';

function citation(documentId: string) {
  return {
    documentId,
    chunkId: 'chunk-1',
    filename: 'f.pdf',
    pageNumber: 1,
    similarity: 0.9
  };
}

describe('CitationService.validateCitations — Phase 71B authorizedOwnerIds (additive)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('legacy 5-argument calls still reject a citation owned by a different user (unchanged behavior)', async () => {
    (prisma.document.findFirst as jest.Mock).mockResolvedValue({ id: 'doc-1', userId: 'owner-a', knowledgeBases: [] });

    await expect(
      citationService.validateCitations([citation('doc-1')], 'requester-b')
    ).rejects.toThrow('Unauthorized citation document reference');
  });

  it('accepts a citation owned by a different-but-authorized member when authorizedOwnerIds is provided', async () => {
    (prisma.document.findFirst as jest.Mock).mockResolvedValue({ id: 'doc-1', userId: 'owner-a', knowledgeBases: [] });

    const result = await citationService.validateCitations(
      [citation('doc-1')],
      'requester-b',
      undefined,
      undefined,
      undefined,
      new Set(['owner-a', 'owner-c'])
    );

    expect(result).toHaveLength(1);
  });

  it('still rejects a citation owned by a user outside authorizedOwnerIds', async () => {
    (prisma.document.findFirst as jest.Mock).mockResolvedValue({ id: 'doc-1', userId: 'owner-x', knowledgeBases: [] });

    await expect(
      citationService.validateCitations([citation('doc-1')], 'requester-b', undefined, undefined, undefined, new Set(['owner-a']))
    ).rejects.toThrow('Unauthorized citation document reference');
  });
});
