import { citationService } from '@/features/rag/citation/citation.service';
import { EvidenceIdEntry } from '@/features/rag/citation/evidence-attribution';
import { RetrievedChunk } from '@/features/rag/retrieval/retrieval.types';

/**
 * citation.service.ts imports only prisma/errors/types — no env dependency — so this runs for
 * real in this sandbox, unlike chat-service tests that must mock @/config/env.
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

describe('CitationService.mapEvidenceReferencesToCitations', () => {
  const docEntry: EvidenceIdEntry = { evidenceId: 'DOC-1', chunk: chunk({ id: 'd1', content: 'MFA is required for all logins.', filename: 'policy.pdf' }) };
  const graphEntry: EvidenceIdEntry = { evidenceId: 'GRAPH-1', chunk: chunk({ id: 'g1', content: 'Entity A reports to Entity B.', filename: 'org-chart.pdf', retrievalSource: 'graph' }) };
  const entries = [docEntry, graphEntry];

  it('builds a citation only for evidence actually referenced by identifier', () => {
    const result = citationService.mapEvidenceReferencesToCitations('MFA is mandatory [DOC-1].', entries, 'is MFA required?');

    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]).toMatchObject({ chunkId: 'd1', documentId: 'doc-1' });
    expect(result.referencedEvidenceIds).toEqual(['DOC-1']);
    expect(result.invalidEvidenceReferenceCount).toBe(0);
  });

  it('never falls back to citing every retrieved chunk when zero markers are present (Phase 8)', () => {
    const result = citationService.mapEvidenceReferencesToCitations('I could not find this in the documents.', entries, 'q');
    expect(result.citations).toEqual([]);
    expect(result.referencedEvidenceIds).toEqual([]);
  });

  it('ignores a fabricated identifier and counts it as invalid, without throwing', () => {
    const result = citationService.mapEvidenceReferencesToCitations('According to [DOC-1] and [GRAPH-99].', entries, 'q');
    expect(result.citations).toHaveLength(1);
    expect(result.invalidEvidenceReferenceCount).toBe(1);
  });

  it('handles mixed document and graph citations, both mapped to real chunk data', () => {
    const result = citationService.mapEvidenceReferencesToCitations('Doc evidence [DOC-1] and graph evidence [GRAPH-1].', entries, 'q');
    expect(result.citations.map((c) => c.chunkId)).toEqual(['d1', 'g1']);
    expect(result.citations.find((c) => c.chunkId === 'g1')?.sourceType).toBe('graph');
  });

  it('returns empty immediately when no evidence entries were ever presented to the LLM', () => {
    const result = citationService.mapEvidenceReferencesToCitations('[DOC-1]', [], 'q');
    expect(result).toEqual({
      citations: [], referencedEvidenceIds: [],
      invalidEvidenceReferenceCount: 0, duplicateReferenceCount: 0, malformedReferenceCount: 0
    });
  });

  it('does not affect mapCitationsToAnswer\'s existing unconditional-mapping behavior (backward compatibility)', () => {
    // This is the pre-existing method other callers (e.g. the orchestrator's pre-generation
    // citation-candidate count) still rely on unchanged — every chunk maps to a citation
    // regardless of the (here, empty) answer text passed in.
    const result = citationService.mapCitationsToAnswer('', [docEntry.chunk, graphEntry.chunk], 'q');
    expect(result.citations).toHaveLength(2);
  });
});
