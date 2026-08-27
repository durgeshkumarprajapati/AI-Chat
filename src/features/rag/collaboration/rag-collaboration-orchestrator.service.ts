import { answerOrchestratorService } from '../orchestration/answer-orchestrator.service';
import { OrchestratedAnswer, OrchestrationInput } from '../orchestration/answer-orchestrator.types';
import { scopeResolverService } from './scope-resolver.service';
import { multiOwnerAnswerService } from './multi-owner-answer.service';
import { RetrievalScope } from './retrieval-scope.types';

export interface OrchestrateForConversationOptions {
  model?: string;
  skipCache?: boolean;
}

/**
 * The thin, additive wrapper that lets PRIVATE/GROUP/PROJECT RagConversations reuse the existing
 * RAG engine. Deliberately bypasses chat.service.ts entirely — a RagConversation never touches
 * the Conversation/Message tables or /api/chat. For PRIVATE, calls the existing, unmodified
 * `answerOrchestratorService.orchestrate()` directly (byte-identical to how a private chat would
 * behave). For GROUP/PROJECT, delegates to the multi-owner fan-out service, since a single
 * `orchestrate()` call can only ever see documents owned by the requesting user (retrieval.service.ts's
 * SQL is single-owner-scoped) — not a fork of the RAG engine, just a different way of composing it.
 */
export class RagCollaborationOrchestratorService {
  public async orchestrateForConversation(
    userId: string,
    ragConversationId: string,
    question: string,
    opts?: OrchestrateForConversationOptions
  ): Promise<OrchestratedAnswer> {
    const scope = await scopeResolverService.resolveScope(userId, ragConversationId);

    if (scope.isHardScoped && scope.authorizedDocumentIds && scope.authorizedDocumentIds.length === 0) {
      return this.emptyAuthorizedAnswer(scope);
    }

    if (scope.conversationType === 'PRIVATE') {
      const input: OrchestrationInput = {
        userId: scope.userId,
        question,
        conversationId: scope.conversationId,
        sourceMode: scope.allowWebSearch ? undefined : 'documents_only',
        model: opts?.model,
        skipCache: opts?.skipCache
      };
      return answerOrchestratorService.orchestrate(input);
    }

    const result = await multiOwnerAnswerService.answer(scope, question);
    return this.applyHardRefilter(result, scope);
  }

  /**
   * Post-hoc hard re-filter: closes the gap that a soft, never-zeroing filter cannot guarantee.
   * No-op for PRIVATE (isHardScoped is always false there, so authorizedDocumentIds is never set).
   */
  private applyHardRefilter(result: OrchestratedAnswer, scope: RetrievalScope): OrchestratedAnswer {
    if (!scope.isHardScoped || !scope.authorizedDocumentIds) {
      return result;
    }
    const allowed = new Set(scope.authorizedDocumentIds);
    return {
      ...result,
      retrievedChunks: result.retrievedChunks.filter((c) => allowed.has(c.documentId)),
      citations: result.citations.filter((c) => !c.documentId || allowed.has(c.documentId))
    };
  }

  private emptyAuthorizedAnswer(scope: RetrievalScope): OrchestratedAnswer {
    return {
      conversationId: scope.conversationId,
      answerMode: 'NO_DOCUMENT_EVIDENCE',
      answer: 'No authorized documents or knowledge bases are available in this conversation yet.',
      citations: [],
      retrievedChunks: [],
      topSimilarity: 0,
      contextMessagesCount: 0,
      cacheHit: false,
      cacheType: 'none',
      llmCalled: false,
      embeddingCalled: false,
      vectorSearchCalled: false,
      keywordSearchCalled: false,
      rerankCalled: false,
      recoveryAttempted: false,
      recoveryAttempts: 0,
      latencyTrace: {}
    };
  }
}

export const ragCollaborationOrchestratorService = new RagCollaborationOrchestratorService();
