import { RetrievedChunk } from '../retrieval/retrieval.types';

/**
 * Pure, dependency-free evidence-attribution primitives (Phase 2/4/5/7 of the phase that
 * introduced [DOC-n]/[GRAPH-n] attribution, extended by this pass's reliability audit/hardening).
 * Deliberately importing nothing beyond the RetrievedChunk type, so this module is fully
 * unit-testable without pulling in env/prisma/LLM-provider infrastructure.
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
  // --- Original (pre-hardening) fields — semantics unchanged, kept for backward compatibility ---
  totalRetrievedEvidenceCount: number;
  documentEvidenceReferencedCount: number;
  graphEvidenceReferencedCount: number;
  /**
   * Share of REFERENCED evidence (not of total retrieved evidence) that came from the graph —
   * i.e. "of what the model actually cited, how much was graph-sourced." 0 when nothing was
   * referenced, never NaN/Infinity.
   */
  graphEvidenceReferencedRatio: number;
  /** Total OCCURRENCES of a well-formed-but-unresolvable marker (e.g. [DOC-99] when only 3 DOC
   * entries exist) — every mention counts, including repeats of the same invalid id. Unchanged
   * semantics from before this pass's hardening. */
  invalidEvidenceReferenceCount: number;

  // --- New fields added by this pass's reliability hardening — see doc comments below ---
  /** Same value as totalRetrievedEvidenceCount, exposed under this pass's requested vocabulary. */
  citationRequestedEvidenceCount: number;
  /** Same value as documentEvidenceReferencedCount + graphEvidenceReferencedCount. */
  citationReferencedEvidenceCount: number;
  /** Same value as invalidEvidenceReferenceCount, exposed under this pass's requested name. */
  citationInvalidReferenceCount: number;
  /** Count of REPEAT mentions of an ALREADY-VALID reference beyond its first occurrence — e.g.
   * "[DOC-1] [DOC-1] [DOC-1]" contributes 2 (not 3). Does NOT count repeats of invalid/malformed
   * markers — see parseEvidenceReferences's own doc comment for why those are tracked separately. */
  citationDuplicateReferenceCount: number;
  /** Count of OCCURRENCES that are citation-SHAPED (start with a DOC/GRAPH-like bracketed prefix)
   * but fail basic syntax — empty or non-numeric body ([DOC-], [DOC-X]), or a prefix that merely
   * starts with DOC/GRAPH but isn't exactly that ([DOCUMENT-1]). Distinct from "invalid": a
   * malformed marker never even reaches the point of being looked up against the registry, because
   * it isn't a well-formed `[DOC|GRAPH]-<digits>` string in the first place. [GRAPH-999] and
   * [DOC-0] are syntactically well-formed digit sequences that simply don't resolve — those are
   * INVALID, not malformed. This distinction is deliberate, not incidental. */
  citationMalformedReferenceCount: number;
  /**
   * citationReferencedEvidenceCount / citationRequestedEvidenceCount (0 when nothing was
   * requested). This measures how much of the evidence PRESENTED to the model was cited — it is
   * NOT a quality score. A low ratio can mean the model correctly ignored irrelevant retrieved
   * chunks; a high ratio does not mean the answer is more correct or better grounded. Never
   * interpret this as an answer-quality signal on its own.
   */
  citationCoverageRatio: number;
  /** Same value as documentEvidenceReferencedCount, exposed under this pass's requested name. */
  documentCitationCount: number;
  /** Same value as graphEvidenceReferencedCount, exposed under this pass's requested name. */
  graphCitationCount: number;
  /**
   * True only when evidence WAS presented to the model (citationRequestedEvidenceCount > 0) but
   * zero valid references were made. False when there was no evidence to cite in the first place
   * (that is NO_RETRIEVAL_CONTEXT, a different state — see AttributionQuality) — "uncited" implies
   * the model had something available to cite and didn't, not merely that nothing existed.
   */
  uncitedAnswer: boolean;
  /** Deterministic classification — see classifyAttributionQuality's own doc comment for the exact,
   * measurable meaning of each value and what it explicitly does NOT claim. */
  attributionQuality: AttributionQuality;
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

/**
 * Matches any bracketed token that LOOKS like a citation attempt: a prefix starting with DOC or
 * GRAPH (optionally followed by more uppercase letters, catching near-misses like DOCUMENT),
 * a hyphen, then anything up to the closing bracket. Deliberately narrow — it does NOT match
 * arbitrary bracketed prose (e.g. "[Note - see below]", markdown reference links) since those
 * don't start with DOC/GRAPH. This is a known, intentional scope limit: other malformed spellings
 * that don't start with DOC/GRAPH (e.g. a typo'd "[EVIDENCE-1]") are not detected — see this
 * phase's report for the full list of known gaps.
 */
const CITATION_LIKE_PATTERN = /\[((?:DOC|GRAPH)[A-Z]*)-([^\]]*)\]/g;

/**
 * Strips markdown fenced code blocks and inline code spans before citation parsing — defensive
 * against the model echoing back a literal bracket-dash-number sequence (e.g. a quoted JSON
 * example, or a code sample from a retrieved chunk) that happens to look like a real citation
 * marker. This is a narrow, deliberate heuristic covering ONLY markdown code syntax — arbitrary
 * quoted prose (e.g. the model repeating the user's own question verbatim) is NOT stripped and
 * could still produce a false-positive match if it happens to contain literal bracket text in
 * exactly this shape. That residual risk is documented, not silently claimed to be solved.
 */
function stripCodeSpans(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
}

/**
 * Parses evidence-identifier markers out of a generated answer and validates every one against
 * `entries` — the current request's own in-memory evidence registry. An identifier that does not
 * exist in `entries` (out of range, fabricated, or referencing a different request's numbering
 * entirely) is never resolved to anything; it is only counted. This is the sole point where an
 * LLM-supplied string is compared against real data, and it never causes a lookup outside
 * `entries` — there is no database call, no cache call, nothing derived from the raw identifier
 * text beyond this in-memory Map read.
 *
 * Classification per occurrence (see CITATION_LIKE_PATTERN):
 *  - well-formed (`[DOC|GRAPH]-<digits>` exactly) AND present in `entries` => a real reference
 *    (deduplicated — repeats increment citationDuplicateReferenceCount instead of being re-added).
 *  - well-formed but absent from `entries` => invalid (every occurrence counts, no dedup — this
 *    preserves this field's original, already-shipped semantics unchanged).
 *  - not well-formed at all (bad prefix or non-numeric body) => malformed (every occurrence
 *    counts).
 *
 * Content inside fenced/inline code spans is stripped before scanning (see stripCodeSpans).
 */
export function parseEvidenceReferences(
  answer: string,
  entries: EvidenceIdEntry[]
): {
  referencedEntries: EvidenceIdEntry[];
  invalidEvidenceReferenceCount: number;
  duplicateReferenceCount: number;
  malformedReferenceCount: number;
} {
  const lookup = new Map(entries.map((e) => [e.evidenceId, e]));
  const referencedIds = new Set<string>();
  let invalidEvidenceReferenceCount = 0;
  let duplicateReferenceCount = 0;
  let malformedReferenceCount = 0;

  const scannedText = stripCodeSpans(answer);

  for (const match of scannedText.matchAll(CITATION_LIKE_PATTERN)) {
    const prefix = match[1] ?? '';
    const body = match[2] ?? '';
    const isWellFormed = (prefix === 'DOC' || prefix === 'GRAPH') && /^\d+$/.test(body);

    if (!isWellFormed) {
      malformedReferenceCount++;
      continue;
    }

    const id = `${prefix}-${body}`;
    if (lookup.has(id)) {
      if (referencedIds.has(id)) {
        duplicateReferenceCount++;
      } else {
        referencedIds.add(id);
      }
    } else {
      invalidEvidenceReferenceCount++;
    }
  }

  // Preserve retrieval-rank order (not textual mention order) — matches this codebase's existing
  // citation-numbering convention (citations are numbered by retrieval rank elsewhere too).
  const referencedEntries = entries.filter((e) => referencedIds.has(e.evidenceId));

  return { referencedEntries, invalidEvidenceReferenceCount, duplicateReferenceCount, malformedReferenceCount };
}

/**
 * Deterministic attribution-quality classification (Phase 4). Based ONLY on facts this system can
 * actually measure — presence/absence/validity of citation markers. Precedence (checked in order):
 *  1. NO_RETRIEVAL_CONTEXT — nothing was ever presented to the model; there was nothing it could
 *     have cited. Not a quality problem, just an inapplicable state.
 *  2. INVALID_REFERENCES_PRESENT — at least one invalid or malformed marker occurred, even if some
 *     other markers in the same answer were valid. Presence of ANY broken attempt is surfaced,
 *     not averaged away by otherwise-correct citations.
 *  3. NO_REFERENCES — evidence existed and nothing was wrong, but zero references were made at all.
 *  4. PARTIAL_REFERENCES — at least one valid reference, but not all presented evidence was cited.
 *     This is DESCRIPTIVE, not evaluative: citing only 2 of 5 retrieved chunks is often exactly
 *     correct behavior, not a defect. Never treat this as "worse" than VALID_REFERENCES.
 *  5. VALID_REFERENCES — every marker found was well-formed and resolved, and all presented
 *     evidence was referenced. This means ONLY that the references present were syntactically and
 *     referentially valid — it is NOT a claim that the citations semantically support the specific
 *     claims they're attached to (see this phase's report, Risk B — that is not measurable today).
 */
export type AttributionQuality =
  | 'NO_RETRIEVAL_CONTEXT'
  | 'NO_REFERENCES'
  | 'PARTIAL_REFERENCES'
  | 'VALID_REFERENCES'
  | 'INVALID_REFERENCES_PRESENT';

export function classifyAttributionQuality(params: {
  totalRetrievedEvidenceCount: number;
  referencedCount: number;
  invalidReferenceCount: number;
  malformedReferenceCount: number;
}): AttributionQuality {
  const { totalRetrievedEvidenceCount, referencedCount, invalidReferenceCount, malformedReferenceCount } = params;

  if (totalRetrievedEvidenceCount === 0) return 'NO_RETRIEVAL_CONTEXT';
  if (invalidReferenceCount > 0 || malformedReferenceCount > 0) return 'INVALID_REFERENCES_PRESENT';
  if (referencedCount === 0) return 'NO_REFERENCES';
  if (referencedCount < totalRetrievedEvidenceCount) return 'PARTIAL_REFERENCES';
  return 'VALID_REFERENCES';
}

/** Replaces proxy-only assumptions with real measurement now that actual final-answer references
 * are known. `totalRetrievedEvidenceCount` should be the count of evidence actually presented to
 * the LLM (i.e. entries.length before filtering), not the full unfiltered retrieval result, since
 * only presented evidence could ever have been referenced. */
export function computeEvidenceAttributionMetrics(
  totalRetrievedEvidenceCount: number,
  referencedEntries: EvidenceIdEntry[],
  invalidEvidenceReferenceCount: number,
  duplicateReferenceCount = 0,
  malformedReferenceCount = 0
): EvidenceAttributionMetrics {
  const documentEvidenceReferencedCount = referencedEntries.filter((e) => e.chunk.retrievalSource !== 'graph').length;
  const graphEvidenceReferencedCount = referencedEntries.length - documentEvidenceReferencedCount;
  const totalReferenced = referencedEntries.length;

  const attributionQuality = classifyAttributionQuality({
    totalRetrievedEvidenceCount,
    referencedCount: totalReferenced,
    invalidReferenceCount: invalidEvidenceReferenceCount,
    malformedReferenceCount
  });

  return {
    totalRetrievedEvidenceCount,
    documentEvidenceReferencedCount,
    graphEvidenceReferencedCount,
    graphEvidenceReferencedRatio: totalReferenced > 0 ? Number((graphEvidenceReferencedCount / totalReferenced).toFixed(4)) : 0,
    invalidEvidenceReferenceCount,

    citationRequestedEvidenceCount: totalRetrievedEvidenceCount,
    citationReferencedEvidenceCount: totalReferenced,
    citationInvalidReferenceCount: invalidEvidenceReferenceCount,
    citationDuplicateReferenceCount: duplicateReferenceCount,
    citationMalformedReferenceCount: malformedReferenceCount,
    citationCoverageRatio: totalRetrievedEvidenceCount > 0 ? Number((totalReferenced / totalRetrievedEvidenceCount).toFixed(4)) : 0,
    documentCitationCount: documentEvidenceReferencedCount,
    graphCitationCount: graphEvidenceReferencedCount,
    uncitedAnswer: totalRetrievedEvidenceCount > 0 && totalReferenced === 0,
    attributionQuality
  };
}
