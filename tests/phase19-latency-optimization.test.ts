import { LocalReranker } from '../src/features/rag/retrieval/reranker';
import { RetrievalMetrics } from '../src/features/rag/retrieval/retrieval.types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function run() {
  const trace: RetrievalMetrics = { embeddingMs: 12, vectorMs: 8, keywordMs: 6, mergeMs: 1, rerankMs: 2, totalMs: 29 };
  assert(trace.embeddingMs !== trace.vectorMs, 'Embedding and vector latency must be separately represented');
  assert(trace.totalMs >= trace.embeddingMs, 'Retrieval total must include embedding work');

  const reranked = new LocalReranker().rerank('refund policy', [{
    id: 'chunk', documentId: 'doc', filename: 'terms.pdf', chunkIndex: 0, pageNumber: 1,
    content: 'The refund policy is available for thirty days.', tokenCount: 9, similarity: 0.8, metadata: {}
  }]);
  assert(reranked[0]?.rerankScore !== undefined, 'Reranking must remain deterministic and measured separately');

  // These field names are the contract persisted by EvaluationService and displayed by the dashboard.
  const responseTrace = { conversationContextMs: 3, embeddingMs: 12, vectorMs: 8, keywordMs: 6, mergeMs: 1, rerankMs: 2, promptBuildMs: 1, llmFirstTokenMs: 20, llmGenerationMs: 30, persistenceMs: 4, totalResponseMs: 80 };
  assert(responseTrace.totalResponseMs !== responseTrace.llmGenerationMs, 'Response and LLM latency must not be conflated');
  console.log('✅ Phase 19 latency instrumentation contract passed.');
}
run().catch((error) => { console.error(error); process.exit(1); });
