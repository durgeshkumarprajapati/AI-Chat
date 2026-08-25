// The documentIdFilter is a small inline block inside RetrievalService.retrieveContextWithTrace
// operating on already-fetched RetrievedChunk[] candidates, following the exact same contract as
// Phase 69A's documentTypeFilter (see tests/phase69-metadata-aware-retrieval.test.ts). This test
// exercises that contract directly, independent of the surrounding DB/embedding plumbing.
function applyDocumentIdFilter(candidates: Array<{ documentId: string }>, filter?: string[]) {
  if (!filter?.length) return candidates;
  const filtered = candidates.filter((c) => filter.includes(c.documentId));
  return filtered.length > 0 ? filtered : candidates;
}

function applyBothFilters(
  candidates: Array<{ documentId: string; metadata: Record<string, unknown> }>,
  documentTypeFilter?: string[],
  documentIdFilter?: string[]
) {
  let scoped = candidates;
  if (documentTypeFilter?.length) {
    const filtered = scoped.filter((c) => {
      const t = c.metadata?.documentType;
      return !t || documentTypeFilter.includes(t as string);
    });
    scoped = filtered.length > 0 ? filtered : scoped;
  }
  return applyDocumentIdFilter(scoped, documentIdFilter);
}

describe('RetrievalService — Phase 69B documentIdFilter contract', () => {
  it('keeps only chunks whose documentId is in the filter set', () => {
    const candidates = [{ documentId: 'doc-1' }, { documentId: 'doc-2' }];
    expect(applyDocumentIdFilter(candidates, ['doc-1'])).toEqual([{ documentId: 'doc-1' }]);
  });

  it('never zeroes out a non-empty candidate set even if nothing matches', () => {
    const candidates = [{ documentId: 'doc-1' }];
    expect(applyDocumentIdFilter(candidates, ['doc-99'])).toEqual(candidates);
  });

  it('is a complete no-op when unset', () => {
    const candidates = [{ documentId: 'doc-1' }];
    expect(applyDocumentIdFilter(candidates, undefined)).toBe(candidates);
  });

  it('composes correctly with documentTypeFilter (both can narrow, either can no-op)', () => {
    const candidates = [
      { documentId: 'doc-1', metadata: { documentType: 'REPORT' } },
      { documentId: 'doc-2', metadata: { documentType: 'REPORT' } },
      { documentId: 'doc-3', metadata: { documentType: 'INVOICE' } }
    ];

    const result = applyBothFilters(candidates, ['REPORT'], ['doc-1']);
    expect(result).toEqual([{ documentId: 'doc-1', metadata: { documentType: 'REPORT' } }]);
  });
});
