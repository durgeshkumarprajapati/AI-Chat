import dotenv from 'dotenv';
dotenv.config();
import { PromptContextService } from '../src/features/rag/chat/prompt-context.service';
import { LocalReranker } from '../src/features/rag/retrieval/reranker';

const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const chunk = (id: string, content: string) => ({ id, documentId: `doc-${id}`, filename: `${id}.pdf`, chunkIndex: 0, pageNumber: 1, content, tokenCount: 1000, similarity: 0.9, metadata: {} });

async function run() {
  const service = new PromptContextService();
  const result = service.optimize({ summary: 'Old discussion '.repeat(300), messages: [{ role: 'USER', content: 'Recent history '.repeat(600) }], chunks: [chunk('a', 'Evidence A '.repeat(2000)), chunk('b', 'Evidence B '.repeat(2000))] });
  assert(result.promptTokenEstimate <= Number(process.env.RAG_LLM_PROMPT_MAX_TOKENS || 3000), 'Prompt budget exceeded');
  assert(result.chunks.length > 0 && result.chunks[0]?.id === 'a', 'Highest-ranked evidence was not preserved');
  assert(result.context.includes('[Document: a.pdf | Page: 1]'), 'Citation source metadata was lost');
  assert(new LocalReranker().rerank('evidence', result.chunks).length === result.chunks.length, 'Reranking regression');
  console.log('✅ Phase 20 prompt budgeting, evidence identity, and reranking contracts passed.');
}
run().catch((error) => { console.error(error); process.exit(1); });
