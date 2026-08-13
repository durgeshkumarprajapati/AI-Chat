import { env } from '@/config/env';
import { RetrievedChunk } from '../retrieval/retrieval.types';

export type PromptContextInput = {
  summary: string | null;
  messages: Array<{ role: string; content: string }>;
  chunks: RetrievedChunk[];
};

export type OptimizedPromptContext = {
  context: string;
  chunks: RetrievedChunk[];
  promptTokenEstimate: number;
  conversationContextTokens: number;
  retrievedContextTokens: number;
};

/** Deterministically budgets prompt content without altering retrieval or citation identity. */
export class PromptContextService {
  public estimateTokens(text: string): number { return text ? Math.ceil(text.length / 4) : 0; }

  public optimize(input: PromptContextInput): OptimizedPromptContext {
    const budget = env.server?.RAG_LLM_PROMPT_MAX_TOKENS ?? 3000;
    const chunkLimit = env.server?.RAG_LLM_CONTEXT_CHUNKS ?? 5;
    const questionReserve = 128;
    const evidenceBudget = Math.max(256, Math.floor((budget - questionReserve) * 0.72));
    const conversationBudget = Math.max(128, budget - questionReserve - evidenceBudget);

    const conversationParts: string[] = [];
    let conversationTokens = 0;
    // Summary captures old turns; only newest messages are included after it.
    if (input.summary) {
      const summary = this.truncate(input.summary, Math.floor(conversationBudget * 0.45));
      conversationParts.push(`=== CONVERSATION SUMMARY ===\n${summary}`);
      conversationTokens += this.estimateTokens(summary);
    }
    for (const message of [...input.messages].reverse()) {
      const remaining = conversationBudget - conversationTokens;
      if (remaining <= 0) break;
      const content = this.truncate(message.content, remaining);
      if (!content) continue;
      conversationParts.unshift(`${message.role}: ${content}`);
      conversationTokens += this.estimateTokens(content);
    }

    const selected: RetrievedChunk[] = [];
    const evidenceParts: string[] = [];
    let evidenceTokens = 0;
    for (const chunk of input.chunks.slice(0, chunkLimit)) {
      const remaining = evidenceBudget - evidenceTokens;
      if (remaining <= 0) break;
      const content = this.truncate(chunk.content, Math.max(1, remaining - 12));
      if (!content) continue;
      selected.push(chunk);
      evidenceParts.push(`[Document: ${chunk.filename} | Page: ${chunk.pageNumber}]\n${content}`);
      evidenceTokens += this.estimateTokens(content) + 12;
    }

    const blocks = [
      ...(conversationParts.length ? [`=== CONVERSATION HISTORY ===\n${conversationParts.join('\n')}`] : []),
      `=== RETRIEVED DOCUMENT EVIDENCE ===\n${evidenceParts.join('\n\n---\n\n')}`
    ];
    const context = blocks.join('\n\n');
    return { context, chunks: selected, promptTokenEstimate: this.estimateTokens(context), conversationContextTokens: conversationTokens, retrievedContextTokens: evidenceTokens };
  }

  private truncate(text: string, maxTokens: number): string {
    if (maxTokens <= 0 || !text) return '';
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;
    const head = Math.floor(maxChars * 0.75);
    const tail = Math.max(1, maxChars - head - 20);
    return `${text.slice(0, head)}\n…[truncated]…\n${text.slice(-tail)}`;
  }
}

export const promptContextService = new PromptContextService();
