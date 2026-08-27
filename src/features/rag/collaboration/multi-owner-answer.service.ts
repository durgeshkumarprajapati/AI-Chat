import { prisma } from '@/lib/prisma';
import { env } from '@/config/env';
import { ValidationError } from '@/errors';
import { retrievalService } from '../retrieval/retrieval.service';
import { localReranker } from '../retrieval/reranker';
import { RetrievedChunk } from '../retrieval/retrieval.types';
import { evidenceAssessmentService } from '../orchestration/evidence-assessment.service';
import { promptContextService } from '../chat/prompt-context.service';
import { citationService } from '../citation/citation.service';
import { getLLMProvider } from '../llm/llm.provider.factory';
import { OrchestratedAnswer } from '../orchestration/answer-orchestrator.types';
import { RetrievalScope } from './retrieval-scope.types';

interface OwnerResolution {
  owners: Set<string>;
  ownerOfDocument: Map<string, string>;
  ownerOfKnowledgeBase: Map<string, string>;
}

/**
 * GROUP/PROJECT answer generation. `retrieval.service.ts`'s SQL hardcodes `WHERE d.user_id =
 * ${userId}`, so a single `retrieveContextWithTrace()` call can only ever see one owner's
 * documents — a GROUP/PROJECT scope's authorized documents are typically owned by DIFFERENT
 * members. This service resolves that by calling the EXISTING, unmodified `retrievalService`
 * once per distinct owner (passing that owner's real userId, so the SQL check passes, and a
 * `documentIdFilter` narrowed to only what's authorized for this conversation), then merges and
 * reranks with the EXISTING, unmodified `localReranker` — composing existing primitives, never
 * forking retrieval logic. Stateless (no mutable instance fields) — safe for the shared singleton
 * to serve concurrent requests.
 */
export class MultiOwnerAnswerService {
  public async answer(scope: RetrievalScope, question: string): Promise<OrchestratedAnswer> {
    const startTime = Date.now();
    const latencyTrace: Record<string, number> = {};

    const { owners, ownerOfDocument, ownerOfKnowledgeBase } = await this.resolveOwners(scope);
    const maxFanout = env.server?.RAG_GROUP_MAX_FANOUT_OWNERS ?? 20;
    if (owners.size > maxFanout) {
      throw new ValidationError(`Scope spans ${owners.size} distinct owners, exceeding the maximum of ${maxFanout}`);
    }

    const queryEmbedding = await retrievalService.getQueryEmbedding(question);
    latencyTrace.embeddingMs = queryEmbedding.generationMs;

    const fanoutStart = Date.now();
    const perOwnerResults = await Promise.all(
      Array.from(owners).map(async (ownerId) => {
        const docIds = (scope.authorizedDocumentIds ?? []).filter((id) => ownerOfDocument.get(id) === ownerId);
        const kbIds = (scope.authorizedKnowledgeBaseIds ?? []).filter((id) => ownerOfKnowledgeBase.get(id) === ownerId);

        const results: RetrievedChunk[] = [];

        if (docIds.length) {
          const res = await retrievalService.retrieveContextWithTrace(ownerId, question, {
            documentIdFilter: docIds,
            sourceMode: 'documents_only',
            queryVector: queryEmbedding.vector
          });
          results.push(...res.chunks);
        }

        for (const kbId of kbIds) {
          const res = await retrievalService.retrieveContextWithTrace(ownerId, question, {
            knowledgeBaseId: kbId,
            sourceMode: 'documents_only',
            queryVector: queryEmbedding.vector
          });
          results.push(...res.chunks);
        }

        return results;
      })
    );
    latencyTrace.retrievalMs = Date.now() - fanoutStart;

    const merged = new Map<string, RetrievedChunk>();
    for (const chunk of perOwnerResults.flat()) {
      merged.set(chunk.id, chunk);
    }
    let chunks = Array.from(merged.values());

    if (scope.isHardScoped) {
      const authorized = new Set(scope.authorizedDocumentIds ?? []);
      chunks = chunks.filter((c) => authorized.has(c.documentId));
    }

    const rerankStart = Date.now();
    const topK = env.server?.RAG_TOP_K ?? 5;
    const reranked = localReranker.rerank(question, chunks).slice(0, topK);
    latencyTrace.rerankMs = Date.now() - rerankStart;

    const evidence = evidenceAssessmentService.assessEvidence(question, reranked);

    let answer = '';
    let citations: OrchestratedAnswer['citations'] = [];
    let llmCalled = false;

    if (evidence.hasStrongEvidence) {
      const promptStart = Date.now();
      const optimizedContext = promptContextService.optimize({ summary: null, messages: [], chunks: reranked });
      latencyTrace.promptBuildMs = Date.now() - promptStart;

      const llmStart = Date.now();
      answer = await getLLMProvider().generateAnswer({ question, context: optimizedContext.context });
      latencyTrace.llmMs = Date.now() - llmStart;
      llmCalled = true;

      const citationResult = citationService.mapCitationsToAnswer(answer, reranked, question);
      citations = await citationService.validateCitations(
        citationResult.citations,
        scope.userId,
        undefined,
        reranked,
        'documents_only',
        owners
      );
    } else {
      answer = "I couldn't find enough authorized information to answer that question confidently.";
    }

    latencyTrace.totalMs = Date.now() - startTime;

    return {
      conversationId: scope.conversationId,
      answerMode: llmCalled ? 'DOCUMENT_GROUNDED' : 'NO_DOCUMENT_EVIDENCE',
      answer,
      citations,
      retrievedChunks: reranked,
      topSimilarity: evidence.topSimilarity,
      contextMessagesCount: 0,
      cacheHit: false,
      cacheType: 'none',
      llmCalled,
      embeddingCalled: true,
      vectorSearchCalled: true,
      keywordSearchCalled: true,
      rerankCalled: true,
      recoveryAttempted: false,
      recoveryAttempts: 0,
      latencyTrace
    };
  }

  private async resolveOwners(scope: RetrievalScope): Promise<OwnerResolution> {
    const ownerOfDocument = new Map<string, string>();
    const ownerOfKnowledgeBase = new Map<string, string>();
    const owners = new Set<string>();

    const documentIds = scope.authorizedDocumentIds ?? [];
    if (documentIds.length) {
      const docs = await prisma.document.findMany({
        where: { id: { in: documentIds } },
        select: { id: true, userId: true }
      });
      for (const doc of docs) {
        ownerOfDocument.set(doc.id, doc.userId);
        owners.add(doc.userId);
      }
    }

    const kbIds = scope.authorizedKnowledgeBaseIds ?? [];
    for (const kbId of kbIds) {
      const kb = await prisma.knowledgeBase.findUnique({ where: { id: kbId }, select: { id: true, userId: true } });
      if (kb) {
        ownerOfKnowledgeBase.set(kb.id, kb.userId);
        owners.add(kb.userId);
      }
    }

    return { owners, ownerOfDocument, ownerOfKnowledgeBase };
  }
}

export const multiOwnerAnswerService = new MultiOwnerAnswerService();
