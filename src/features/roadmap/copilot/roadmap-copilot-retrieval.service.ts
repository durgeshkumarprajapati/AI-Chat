import { prisma } from '@/lib/prisma';
import { retrievalService } from '@/features/rag/retrieval/retrieval.service';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { CopilotRetrievalContext } from './roadmap-copilot-context';
import { RoadmapCopilotRagConfig } from './roadmap-copilot-rag-config';

const RETRIEVAL_TIMEOUT_MS = 8000;
const NO_RESULT: CopilotRetrievalContext = { used: false, documents: [] };

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Retrieval timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

/**
 * RAG-Grounded Context — the ONLY place in the AI Roadmap Copilot that touches retrieval. Every
 * failure mode here (no project link, no access, no documents, retrieval error, timeout, zero
 * relevant content) resolves to the SAME safe `{used: false, documents: []}` result — the caller
 * never has to distinguish "RAG is off" from "RAG failed" from "nothing relevant was found."
 *
 * AUTHORIZATION CHAIN (the security-critical part of this whole feature):
 * 1. Roadmap access is already verified by the caller (findRoadmapByIdForUser) before this is
 *    ever invoked — never re-derived or trusted from anything the AI produced.
 * 2. `ProjectRoadmap` is read (never written; this service NEVER creates a roadmap/project link)
 *    to determine whether this SPECIFIC roadmap is linked to a project. A roadmap MAY now be
 *    linked to more than one project (Project Roadmap Linking & Governance pass — no schema
 *    constraint prevents it, and none is added here). To keep every retrieval request scoped to
 *    exactly ONE project relationship (never merging document sets across projects), every link
 *    is tried in a fixed, deterministic order (oldest link first) and the FIRST project the
 *    requesting user is actually authorized for is used — never a union of authorized projects'
 *    documents. If no link exists, or the user is authorized for none of the linked projects,
 *    retrieval is skipped entirely: there is no safe scope to search, and none is invented.
 * 3. For the chosen project, the REQUESTING user (not the roadmap owner) must independently pass
 *    `projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'ASK_AI')` — the
 *    SAME gate every other AI-over-project-content feature in this codebase already uses. A
 *    roadmap-authorized user with no project access gets zero retrieval, silently.
 * 4. Only `ProjectDocument` rows for that ONE project are loaded (bounded, single project).
 * 5. `retrievalService.retrieveContext` is called with `documentIdFilter` set to those ids — BUT
 *    that filter is a well-documented SOFT, never-zeroing ranking hint elsewhere in the RAG
 *    pipeline (confirmed by reading retrieval.service.ts directly: an empty or non-matching
 *    filter silently falls back to UNFILTERED results). That soft behavior is NOT relied upon as
 *    the authorization boundary here — every returned chunk is hard-filtered again, in this
 *    service, against the exact authorized document id set before anything is used. Retrieval
 *    also only ever runs against `retrieveContext(userId, ...)`, which is itself hardcoded
 *    (`WHERE d.user_id = userId`) to the REQUESTING user's own documents — so a chunk can only
 *    ever surface here if it is BOTH linked to the authorized project AND owned by the
 *    requesting user. No other project member's documents can ever leak through this path.
 */
export class RoadmapCopilotRetrievalService {
  public async retrieve(params: {
    roadmapId: string;
    userId: string;
    query: string;
    config: RoadmapCopilotRagConfig;
  }): Promise<CopilotRetrievalContext> {
    const { roadmapId, userId, query, config } = params;
    if (!config.enabled) return NO_RESULT;

    try {
      const links = await prisma.projectRoadmap.findMany({
        where: { roadmapId },
        select: { projectId: true },
        orderBy: { createdAt: 'asc' }
      });
      if (links.length === 0) return NO_RESULT; // no safe scope — never invented

      // Exactly one project relationship is used per request — never merged across projects.
      let authorizedProjectId: string | null = null;
      for (const link of links) {
        try {
          await projectAuthorizationService.authorizeProjectAccess(userId, link.projectId, 'ASK_AI');
          authorizedProjectId = link.projectId;
          break;
        } catch {
          // roadmap access != project access; try the next linked project, if any.
        }
      }
      if (!authorizedProjectId) return NO_RESULT; // denial is silent, not an error

      const projectDocuments = await prisma.projectDocument.findMany({
        where: { projectId: authorizedProjectId },
        select: { documentId: true }
      });
      const authorizedDocumentIds = projectDocuments.map((d) => d.documentId);
      if (authorizedDocumentIds.length === 0) return NO_RESULT;

      const chunks = await withTimeout(
        retrievalService.retrieveContext(userId, query, {
          documentIdFilter: authorizedDocumentIds,
          sourceMode: 'documents_only',
          topK: config.maxDocuments * config.maxExcerpts
        }),
        RETRIEVAL_TIMEOUT_MS
      );

      // THE authorization boundary — never trust the soft documentIdFilter alone (see class doc).
      const authorizedSet = new Set(authorizedDocumentIds);
      const hardFiltered = chunks.filter((c) => authorizedSet.has(c.documentId));
      if (hardFiltered.length === 0) return NO_RESULT;

      return this.bound(hardFiltered, config);
    } catch (err) {
      console.error('[RoadmapCopilotRetrievalService] Retrieval failed, degrading to no-retrieval:', err instanceof Error ? err.message : err);
      return NO_RESULT;
    }
  }

  /** Applies every configured bound: max documents, max excerpts per document, max characters per
   * excerpt, and a hard total-character cap across the whole result (truncating the LAST excerpt
   * that would exceed it rather than silently dropping the budget check). */
  private bound(
    chunks: { documentId: string; filename: string; content: string }[],
    config: RoadmapCopilotRagConfig
  ): CopilotRetrievalContext {
    const byDocument = new Map<string, { filename: string; excerpts: string[] }>();
    for (const chunk of chunks) {
      if (!byDocument.has(chunk.documentId)) {
        if (byDocument.size >= config.maxDocuments) continue;
        byDocument.set(chunk.documentId, { filename: chunk.filename, excerpts: [] });
      }
      const entry = byDocument.get(chunk.documentId)!;
      if (entry.excerpts.length >= config.maxExcerpts) continue;
      entry.excerpts.push(chunk.content.slice(0, config.maxExcerptChars));
    }

    let remainingChars = config.maxContextChars;
    const documents = [];
    for (const [documentId, entry] of byDocument) {
      if (remainingChars <= 0) break;
      const excerpts: string[] = [];
      for (const excerpt of entry.excerpts) {
        if (remainingChars <= 0) break;
        const bounded = excerpt.slice(0, remainingChars);
        excerpts.push(bounded);
        remainingChars -= bounded.length;
      }
      if (excerpts.length > 0) {
        documents.push({ title: entry.filename, sourceId: documentId, excerpts });
      }
    }

    if (documents.length === 0) return NO_RESULT;
    return { used: true, documents };
  }
}

export const roadmapCopilotRetrievalService = new RoadmapCopilotRetrievalService();
