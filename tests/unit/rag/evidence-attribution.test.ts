import {
  assignEvidenceIds,
  buildEvidenceBlockHeader,
  parseEvidenceReferences,
  computeEvidenceAttributionMetrics,
  EvidenceIdEntry
} from '@/features/rag/citation/evidence-attribution';
import { RetrievedChunk } from '@/features/rag/retrieval/retrieval.types';

/**
 * Pure-function tests for evidence-aware citation attribution (Phase 10 items #1-4, 6-12). This
 * module imports nothing beyond types, so it is fully runnable in this sandbox — unlike
 * chat-service-evidence.test.ts, whose module graph includes env-coupled files.
 */

function chunk(overrides: Partial<RetrievedChunk> & { id: string; content: string }): RetrievedChunk {
  return {
    documentId: overrides.documentId ?? 'doc-1',
    filename: overrides.filename ?? 'doc.pdf',
    chunkIndex: overrides.chunkIndex ?? 0,
    pageNumber: overrides.pageNumber ?? 1,
    tokenCount: overrides.tokenCount ?? 10,
    similarity: overrides.similarity ?? 0.8,
    metadata: overrides.metadata ?? {},
    ...overrides
  };
}

describe('assignEvidenceIds', () => {
  it('1. assigns sequential DOC- ids to non-graph chunks in order', () => {
    const chunks = [chunk({ id: 'a', content: 'x' }), chunk({ id: 'b', content: 'y' }), chunk({ id: 'c', content: 'z' })];
    const entries = assignEvidenceIds(chunks);
    expect(entries.map((e) => e.evidenceId)).toEqual(['DOC-1', 'DOC-2', 'DOC-3']);
  });

  it('3. document evidence gets the DOC- prefix', () => {
    const entries = assignEvidenceIds([chunk({ id: 'a', content: 'x', retrievalSource: 'vector' })]);
    expect(entries[0]?.evidenceId).toBe('DOC-1');
  });

  it('4. graph evidence gets the GRAPH- prefix, numbered independently from DOC-', () => {
    const chunks = [
      chunk({ id: 'a', content: 'x', retrievalSource: 'vector' }),
      chunk({ id: 'b', content: 'y', retrievalSource: 'graph' }),
      chunk({ id: 'c', content: 'z', retrievalSource: 'keyword' }),
      chunk({ id: 'd', content: 'w', retrievalSource: 'graph' })
    ];
    const entries = assignEvidenceIds(chunks);
    expect(entries.map((e) => e.evidenceId)).toEqual(['DOC-1', 'GRAPH-1', 'DOC-2', 'GRAPH-2']);
  });

  it('2. is stable/deterministic: identical input order always produces identical ids, and calls never share state', () => {
    const chunksA = [chunk({ id: 'a', content: 'x' }), chunk({ id: 'b', content: 'y', retrievalSource: 'graph' })];
    const chunksB = [chunk({ id: 'z', content: 'q' })]; // a second, unrelated "request"

    const entriesA1 = assignEvidenceIds(chunksA);
    const entriesB = assignEvidenceIds(chunksB); // must not continue A's counters
    const entriesA2 = assignEvidenceIds(chunksA);

    expect(entriesA1.map((e) => e.evidenceId)).toEqual(['DOC-1', 'GRAPH-1']);
    expect(entriesB.map((e) => e.evidenceId)).toEqual(['DOC-1']);
    expect(entriesA2.map((e) => e.evidenceId)).toEqual(entriesA1.map((e) => e.evidenceId));
  });

  it('never exposes documentId, chunk id, or any database identifier in the evidence id itself', () => {
    const entries = assignEvidenceIds([chunk({ id: 'secret-chunk-id-999', documentId: 'secret-doc-id-123', content: 'x' })]);
    expect(entries[0]?.evidenceId).not.toMatch(/secret/);
    expect(entries[0]?.evidenceId).toMatch(/^(DOC|GRAPH)-\d+$/);
  });
});

describe('buildEvidenceBlockHeader', () => {
  it('includes the new [EVIDENCE: ...] marker while preserving the existing [Document: ...] header verbatim', () => {
    const entry: EvidenceIdEntry = { evidenceId: 'DOC-1', chunk: chunk({ id: 'a', content: 'x', filename: 'a.pdf', pageNumber: 1 }) };
    const header = buildEvidenceBlockHeader(entry);
    expect(header).toContain('[EVIDENCE: DOC-1]');
    // tests/phase20-rag-performance.test.ts asserts on this exact substring — must not regress.
    expect(header).toContain('[Document: a.pdf | Page: 1]');
  });
});

describe('parseEvidenceReferences', () => {
  const docEntry: EvidenceIdEntry = { evidenceId: 'DOC-1', chunk: chunk({ id: 'd1', content: 'doc content' }) };
  const graphEntry: EvidenceIdEntry = { evidenceId: 'GRAPH-1', chunk: chunk({ id: 'g1', content: 'graph content', retrievalSource: 'graph' }) };
  const entries = [docEntry, graphEntry];

  it('6. parses a single valid citation correctly', () => {
    const result = parseEvidenceReferences('The policy requires MFA [DOC-1].', entries);
    expect(result.referencedEntries.map((e) => e.evidenceId)).toEqual(['DOC-1']);
    expect(result.invalidEvidenceReferenceCount).toBe(0);
  });

  it('7. parses multiple distinct citations, deduplicated, in retrieval-rank order', () => {
    const result = parseEvidenceReferences('First claim [DOC-1]. Second claim [GRAPH-1]. Repeated [DOC-1].', entries);
    expect(result.referencedEntries.map((e) => e.evidenceId)).toEqual(['DOC-1', 'GRAPH-1']);
  });

  it('8. an invalid (out-of-range) identifier is counted but never resolved to any chunk', () => {
    const result = parseEvidenceReferences('This claim cites [DOC-99].', entries);
    expect(result.referencedEntries).toEqual([]);
    expect(result.invalidEvidenceReferenceCount).toBe(1);
  });

  it('9. a fabricated identifier not present in the registry at all is rejected the same way', () => {
    const result = parseEvidenceReferences('According to [GRAPH-7] and [DOC-1].', entries);
    expect(result.referencedEntries.map((e) => e.evidenceId)).toEqual(['DOC-1']);
    expect(result.invalidEvidenceReferenceCount).toBe(1);
  });

  it('10. zero markers produces zero referenced entries (no fallback to citing everything)', () => {
    const result = parseEvidenceReferences('The document does not contain enough information.', entries);
    expect(result.referencedEntries).toEqual([]);
    expect(result.invalidEvidenceReferenceCount).toBe(0);
  });

  it('11. graph citation attribution: a lone [GRAPH-n] reference resolves only the graph entry', () => {
    const result = parseEvidenceReferences('Entity A reports to Entity B [GRAPH-1].', entries);
    expect(result.referencedEntries).toEqual([graphEntry]);
  });

  it('12. mixed document and graph citations both resolve correctly', () => {
    const result = parseEvidenceReferences('Doc says X [DOC-1]; graph adds Y [GRAPH-1].', entries);
    expect(result.referencedEntries).toEqual([docEntry, graphEntry]);
  });

  it('malformed brackets (wrong case, missing hyphen) are silently ignored, not miscounted', () => {
    const result = parseEvidenceReferences('See [doc-1] and [DOC1] and [DOC-1].', entries);
    expect(result.referencedEntries.map((e) => e.evidenceId)).toEqual(['DOC-1']);
    expect(result.invalidEvidenceReferenceCount).toBe(0);
  });

  it('13/14. never resolves an identifier against a DIFFERENT request\'s registry (isolation by construction)', () => {
    // Simulates two different requests' registries — a marker valid in request B's numbering must
    // not resolve against request A's entries, since parseEvidenceReferences is only ever given
    // ONE request's own `entries` array (no shared/global registry exists to leak from).
    const requestAEntries = [docEntry];
    const requestBOnlyMarker = 'GRAPH-1'; // valid in graphEntry's own request, not in A's
    const result = parseEvidenceReferences(`Claim [${requestBOnlyMarker}].`, requestAEntries);
    expect(result.referencedEntries).toEqual([]);
    expect(result.invalidEvidenceReferenceCount).toBe(1);
  });
});

describe('computeEvidenceAttributionMetrics', () => {
  it('computes document/graph referenced counts and a graph ratio relative to what was referenced', () => {
    const docA: EvidenceIdEntry = { evidenceId: 'DOC-1', chunk: chunk({ id: 'a', content: 'x' }) };
    const docB: EvidenceIdEntry = { evidenceId: 'DOC-2', chunk: chunk({ id: 'b', content: 'y' }) };
    const graphA: EvidenceIdEntry = { evidenceId: 'GRAPH-1', chunk: chunk({ id: 'c', content: 'z', retrievalSource: 'graph' }) };

    const metrics = computeEvidenceAttributionMetrics(5, [docA, docB, graphA], 2);

    expect(metrics).toEqual({
      totalRetrievedEvidenceCount: 5,
      documentEvidenceReferencedCount: 2,
      graphEvidenceReferencedCount: 1,
      graphEvidenceReferencedRatio: Number((1 / 3).toFixed(4)),
      invalidEvidenceReferenceCount: 2
    });
  });

  it('never divides by zero when nothing was referenced', () => {
    const metrics = computeEvidenceAttributionMetrics(3, [], 0);
    expect(metrics.graphEvidenceReferencedRatio).toBe(0);
  });
});
