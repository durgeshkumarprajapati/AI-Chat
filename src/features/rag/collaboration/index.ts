// Public surface of the Collaborative RAG module (Phase 71A). Callers should import only from
// here — never reach into scope-resolver/multi-owner-answer internals directly.
export { scopeResolverService } from './scope-resolver.service';
export { ragCollaborationOrchestratorService } from './rag-collaboration-orchestrator.service';
export { multiOwnerAnswerService } from './multi-owner-answer.service';
export type { RetrievalScope, RagConversationTypeValue } from './retrieval-scope.types';
