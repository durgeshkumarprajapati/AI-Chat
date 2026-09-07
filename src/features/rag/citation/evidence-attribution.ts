import { RetrievedChunk } from '../retrieval/retrieval.types';

/**
 * Pure, dependency-free evidence-attribution primitives (Phase 2/4/5/7 of this pass). Deliberately
 * importing nothing beyond the RetrievedChunk type, so this module is fully unit-testable without
 * pulling in env/prisma/LLM-provider infrastructure — mirrors the graph-comparison-metrics.ts
 * precedent established earlier this session for the same reason.
 *
 * Evidence identifiers are request-scoped and stateless: `assignEvidenceIds` never reads or
 * writes any shared/global counter, so two concurrent requests can never influence each other's
 * numbering, and nothing here ever exposes a database id, user id, document id, or internal graph
 * entity id — only a source-type prefix (DOC for vector/keyword/hybrid chunks, GRAPH for
 * graph-sourced chunks) and a 1-based position within that source type, for THIS request's chunk
 * list only.
 */

export interface EvidenceIdEntry {
  evidenceId: string;
  chunk: RetrievedChunk;
}

export interface EvidenceAttributionMetrics {
  totalRetrievedEvidenceCount: number;
  documentEvidenceReferencedCount: number;
  graphEvidenceReferencedCount: number;
  /**
   * Share of REFERENCED evidence (not of total retrieved evidence) that came from the graph —
   * i.e. "of what the model actually cited, how much was graph-sourced." 0 when nothing was
   * referenced, never NaN/Infinity.
   */
  graphEvidenceReferencedRatio: number;
  invalidEvidenceReferenceCount: number;
}

/**
 * Assigns stable, deterministic evidence identifiers to an ORDERED list of chunks — must be called
 * with the exact, already-budget-truncated list that will actually appear in the LLM's prompt
 * context (PromptContextService.optimize's `selected` array), so every identifier handed to the
 * model corresponds to a real, present block. Identical input order always produces identical ids.
 */
export function assignEvidenceIds(chunks: RetrievedChunk[]): EvidenceIdEntry[] {
  let docCounter = 0;
  let graphCounter = 0;
  return chunks.map((chunk) => {
    const isGraph = chunk.retrievalSource === 'graph';
    const evidenceId = isGraph ? `GRAPH-${++graphCounter}` : `DOC-${++docCounter}`;
    return { evidenceId, chunk };
  });
}

/**
 * Builds the per-block prompt header for one evidence entry. ADDS the new `[EVIDENCE: DOC-1]`
 * marker line ABOVE the existing `[Document: filename | Page: N]` header rather than replacing it
 * — tests/phase20-rag-performance.test.ts already asserts on the old header's exact substring, so
 * this keeps that contract byte-identical while introducing the new, LLM-safe identifier.
 */
export function buildEvidenceBlockHeader(entry: EvidenceIdEntry): string {
  return `[EVIDENCE: ${entry.evidenceId}]\n[Document: ${entry.chunk.filename} | Page: ${entry.chunk.pageNumber}]`;
}

const EVIDENCE_REFERENCE_PATTERN = /\[(DOC|GRAPH)-(\d+)\]/g;

/**
 * Parses evidence-identifier markers out of a generated answer and validates every one against
 * `entries` — the current request's own in-memory evidence registry. An identifier that does not
 * exist in `entries` (out of range, fabricated, or referencing a different request's numbering
 * entirely) is never resolved to anything; it is only counted. This is the sole point where an
 * LLM-supplied string is compared against real data, and it never causes a lookup outside
 * `entries` — there is no database call, no cache call, nothing derived from the raw identifier
 * text beyond this in-memory Map read.
 */
export function parseEvidenceReferences(
  answer: string,
  entries: EvidenceIdEntry[]
): { referencedEntries: EvidenceIdEntry[]; invalidEvidenceReferenceCount: number } {
  const lookup = new Map(entries.map((e) => [e.evidenceId, e]));
  const referencedIds = new Set<string>();
  let invalidEvidenceReferenceCount = 0;

  for (const match of answer.matchAll(EVIDENCE_REFERENCE_PATTERN)) {
    const id = `${match[1]}-${match[2]}`;
    if (lookup.has(id)) {
      referencedIds.add(id);
    } else {
      invalidEvidenceReferenceCount++;
    }
  }

  // Preserve retrieval-rank order (not textual mention order) — matches this codebase's existing
  // citation-numbering convention (citations are numbered by retrieval rank elsewhere too).
  const referencedEntries = entries.filter((e) => referencedIds.has(e.evidenceId));

  return { referencedEntries, invalidEvidenceReferenceCount };
}

/** Phase 7 — replaces proxy-only assumptions with real measurement now that actual final-answer
 * references are known. `totalRetrievedEvidenceCount` should be the count of evidence actually
 * presented to the LLM (i.e. entries.length before filtering), not the full unfiltered retrieval
 * result, since only presented evidence could ever have been referenced. */
export function computeEvidenceAttributionMetrics(
  totalRetrievedEvidenceCount: number,
  referencedEntries: EvidenceIdEntry[],
  invalidEvidenceReferenceCount: number
): EvidenceAttributionMetrics {
  const documentEvidenceReferencedCount = referencedEntries.filter((e) => e.chunk.retrievalSource !== 'graph').length;
  const graphEvidenceReferencedCount = referencedEntries.length - documentEvidenceReferencedCount;
  const totalReferenced = referencedEntries.length;

  return {
    totalRetrievedEvidenceCount,
    documentEvidenceReferencedCount,
    graphEvidenceReferencedCount,
    graphEvidenceReferencedRatio: totalReferenced > 0 ? Number((graphEvidenceReferencedCount / totalReferenced).toFixed(4)) : 0,
    invalidEvidenceReferenceCount
  };
}
