import { graphRetrievalService } from '@/features/knowledge-graph/retrieval/graph-retrieval.service';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { RetrievedChunk } from './retrieval.types';

/**
 * Bounded to a small number of additional chunks — this is supplementary evidence appended
 * alongside whatever vector/keyword retrieval already found, not a second retrieval pipeline.
 * Keeps prompt-size growth predictable regardless of how large a matched subgraph is.
 */
const MAX_GRAPH_CONTEXT_CHUNKS = 3;

/** Matches RAG_GRAPH_TIMEOUT_MS's own default in src/config/env.ts — used only when the caller
 * doesn't supply a value. Deliberately not imported from `env` directly here: this keeps the
 * service a plain, injectable adapter (no global-config coupling), consistent with how it already
 * accepts `userId`/`scope` from its caller rather than reading them from ambient state. */
const DEFAULT_GRAPH_TIMEOUT_MS = 2500;

/** Distinguishable from a generic Error so withGraphTimeout's caller can classify a timeout
 * specifically, rather than lumping it in with any other failure. */
class GraphRetrievalTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Graph retrieval exceeded ${timeoutMs}ms timeout`);
    this.name = 'GraphRetrievalTimeoutError';
  }
}

/**
 * RAG_GRAPH_TIMEOUT_MS already existed in src/config/env.ts (default 2500ms) but, like
 * RAG_GRAPH_RETRIEVAL_ENABLED before this pass, had zero readers anywhere — a slow/hanging
 * subgraph or evidence query had no bound and would have blocked the whole chat request
 * indefinitely. Reused here (via the caller-supplied `timeoutMs`) rather than introducing a new
 * flag or a new shared timeout utility file.
 */
async function withGraphTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new GraphRetrievalTimeoutError(timeoutMs)), timeoutMs);
  });
  // If `work` rejects AFTER the timeout has already won the race, nothing else observes that
  // rejection — Node would otherwise report it as an unhandled promise rejection. This no-op
  // catch only prevents that warning; it never suppresses the error from the caller, since
  // Promise.race below still settles with whichever promise resolves/rejects first.
  work.catch(() => {});
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Outcome states, shared verbatim with the orchestrator's telemetry (rag-telemetry.service.ts's
 * pre-declared `rag.retrieval.graph.completed` event). `EMPTY_GRAPH`/`SUCCESS`/`FALLBACK_ERROR`
 * are the only 3 this service can itself produce — `DISABLED`/`SKIPPED_SOURCE_MODE`/
 * `SKIPPED_NOT_GRAPH_PRIORITY` are decided by the caller (AnswerOrchestratorService) before this
 * method is ever invoked, since this service has no visibility into flags/sourceMode/query
 * classification by design (it's a pure graph-to-chunks adapter).
 */
export type GraphAugmentationStatus = 'EMPTY_GRAPH' | 'SUCCESS' | 'FALLBACK_ERROR';

/**
 * Failure sub-classification (Phase 6), only ever present when status is FALLBACK_ERROR. Only
 * categories determinable from this file's actual control flow are included — no invented
 * categories. `DATABASE_FAILURE` specifically means Prisma could not reach/initialize the
 * connection at all (Prisma.PrismaClientInitializationError); any other error during the subgraph
 * or evidence stage is classified by WHICH stage was in flight, not by guessing a DB-vs-app-level
 * distinction the code can't actually observe.
 */
export type GraphFailureCategory =
  | 'TIMEOUT'
  | 'DATABASE_FAILURE'
  | 'GRAPH_QUERY_FAILURE'
  | 'EVIDENCE_LOOKUP_FAILURE'
  | 'UNEXPECTED_ERROR';

export interface GraphAugmentationResult {
  chunks: RetrievedChunk[];
  usedGraph: boolean;
  status: GraphAugmentationStatus;
  failureCategory?: GraphFailureCategory;
  graphNodesCount: number;
  graphEdgesCount: number;
  evidenceRecordsCount: number;
  chunksAddedCount: number;
  duplicatesRemovedCount: number;
  /** Evidence rows that existed but were never even inspected because MAX_GRAPH_CONTEXT_CHUNKS
   * was already reached — distinct from duplicatesRemovedCount (rows that WERE inspected and
   * rejected as duplicates). */
  droppedByLimitCount: number;
  graphSubgraphRetrievalMs: number;
  graphEvidenceLookupMs: number;
  graphContextMappingMs: number;
  graphTotalMs: number;
}

/**
 * Connects the existing (previously uncalled) Knowledge Graph retrieval machinery
 * (`graphRetrievalService.retrieveSubgraph`) to the live RAG answer path, WITHOUT duplicating
 * vector/keyword retrieval — unlike `GraphRAGService.retrieveGroundedContext`, which internally
 * re-runs its own vector search, this only reuses the graph-traversal half and appends
 * non-duplicate evidence chunks onto whatever the orchestrator's normal retrieval already
 * produced. Everything downstream (context building, prompt construction, citations) already
 * operates generically on `RetrievedChunk[]`, so no other file needs to change to consume this.
 *
 * Never throws — any failure here must never break a chat request. Callers can rely on always
 * getting back at least `existingChunks` unchanged, plus a `status` (and, on failure, a
 * `failureCategory`) that always reflects what actually happened — never silently swallowed,
 * every failure is logged before falling back.
 */
export class GraphContextAugmenterService {
  public async augment(
    userId: string,
    query: string,
    existingChunks: RetrievedChunk[],
    scope: { knowledgeBaseId?: string | null },
    timeoutMs: number = DEFAULT_GRAPH_TIMEOUT_MS
  ): Promise<GraphAugmentationResult> {
    const totalStart = Date.now();
    let graphSubgraphRetrievalMs = 0;
    let graphEvidenceLookupMs = 0;
    let currentStage: 'SUBGRAPH' | 'EVIDENCE' = 'SUBGRAPH';

    try {
      const subgraphStart = Date.now();
      const subgraph = await withGraphTimeout(graphRetrievalService.retrieveSubgraph({
        userId,
        knowledgeBaseId: scope.knowledgeBaseId ?? undefined,
        searchQuery: query,
        maxNodes: 20
      }), timeoutMs);
      graphSubgraphRetrievalMs = Date.now() - subgraphStart;

      if (subgraph.nodes.length === 0 && subgraph.edges.length === 0) {
        return {
          chunks: existingChunks, usedGraph: false, status: 'EMPTY_GRAPH',
          graphNodesCount: 0, graphEdgesCount: 0, evidenceRecordsCount: 0,
          chunksAddedCount: 0, duplicatesRemovedCount: 0, droppedByLimitCount: 0,
          graphSubgraphRetrievalMs, graphEvidenceLookupMs: 0, graphContextMappingMs: 0,
          graphTotalMs: Date.now() - totalStart
        };
      }

      const entityIds = subgraph.nodes.map((n) => n.id);
      const relationshipIds = subgraph.edges.map((e) => e.id);

      currentStage = 'EVIDENCE';
      const evidenceStart = Date.now();
      const evidences = await withGraphTimeout(prisma.knowledgeEvidence.findMany({
        where: {
          OR: [
            { entityId: { in: entityIds } },
            { relationshipId: { in: relationshipIds } }
          ]
        },
        include: { chunk: { include: { document: { select: { filename: true } } } } },
        orderBy: { confidence: 'desc' },
        take: MAX_GRAPH_CONTEXT_CHUNKS * 3 // headroom before the existing-chunk dedup pass below
      }), timeoutMs);
      graphEvidenceLookupMs = Date.now() - evidenceStart;

      const mappingStart = Date.now();
      const existingChunkIds = new Set(existingChunks.map((c) => c.id));
      const graphChunks: RetrievedChunk[] = [];
      let duplicatesRemovedCount = 0;
      let malformedRowsSkipped = 0;
      let droppedByLimitCount = 0;

      for (const ev of evidences) {
        if (graphChunks.length >= MAX_GRAPH_CONTEXT_CHUNKS) {
          droppedByLimitCount++;
          continue;
        }

        // Defensive guard (Phase 8 resilience review): a required, cascade-deleted FK means
        // `ev.chunk` should never be null in well-formed data, but this must not throw or leak an
        // internal DB shape mismatch into the chat response if it ever is — skip and count it.
        if (!ev.chunk) {
          malformedRowsSkipped++;
          continue;
        }

        if (existingChunkIds.has(ev.chunkId) || graphChunks.some((c) => c.id === ev.chunkId)) {
          duplicatesRemovedCount++;
          continue;
        }

        graphChunks.push({
          id: ev.chunkId,
          documentId: ev.documentId,
          filename: ev.chunk.document?.filename || 'Unknown Document',
          chunkIndex: ev.chunk.chunkIndex,
          pageNumber: ev.pageNumber ?? ev.chunk.pageNumber,
          content: ev.chunk.content,
          tokenCount: ev.chunk.tokenCount,
          similarity: ev.confidence,
          retrievalSource: 'graph',
          sourceType: 'DOCUMENT',
          metadata: { graphEvidence: true, entityId: ev.entityId ?? undefined, relationshipId: ev.relationshipId ?? undefined }
        });
      }

      if (malformedRowsSkipped > 0) {
        console.warn(`[GraphContextAugmenterService] Skipped ${malformedRowsSkipped} evidence row(s) with missing chunk data.`);
      }

      const graphContextMappingMs = Date.now() - mappingStart;
      const graphTotalMs = Date.now() - totalStart;

      return {
        chunks: graphChunks.length > 0 ? [...existingChunks, ...graphChunks] : existingChunks,
        usedGraph: graphChunks.length > 0,
        status: 'SUCCESS',
        graphNodesCount: subgraph.nodes.length,
        graphEdgesCount: subgraph.edges.length,
        evidenceRecordsCount: evidences.length,
        chunksAddedCount: graphChunks.length,
        duplicatesRemovedCount,
        droppedByLimitCount,
        graphSubgraphRetrievalMs,
        graphEvidenceLookupMs,
        graphContextMappingMs,
        graphTotalMs
      };
    } catch (err) {
      const failureCategory: GraphFailureCategory =
        err instanceof GraphRetrievalTimeoutError ? 'TIMEOUT'
        : err instanceof Prisma.PrismaClientInitializationError ? 'DATABASE_FAILURE'
        : currentStage === 'SUBGRAPH' ? 'GRAPH_QUERY_FAILURE'
        : currentStage === 'EVIDENCE' ? 'EVIDENCE_LOOKUP_FAILURE'
        : 'UNEXPECTED_ERROR';

      // Logged with the classification, but never exposes raw DB error details to the caller's
      // return value — only this console line (server-side only) sees the actual `err`.
      console.warn(`[GraphContextAugmenterService] Graph augmentation failed (${failureCategory}), falling back to existing retrieval unchanged:`, err);
      return {
        chunks: existingChunks, usedGraph: false, status: 'FALLBACK_ERROR', failureCategory,
        graphNodesCount: 0, graphEdgesCount: 0, evidenceRecordsCount: 0,
        chunksAddedCount: 0, duplicatesRemovedCount: 0, droppedByLimitCount: 0,
        graphSubgraphRetrievalMs, graphEvidenceLookupMs,
        graphContextMappingMs: 0, graphTotalMs: Date.now() - totalStart
      };
    }
  }
}

export const graphContextAugmenterService = new GraphContextAugmenterService();
