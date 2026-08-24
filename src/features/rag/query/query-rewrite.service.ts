import { llmGatewayService } from '@/features/llm';

export class QueryRewriteService {
  /**
   * Generates a rewritten, search-optimized variation of the original query using LLM.
   * Always falls back to original query on timeout or error.
   */
  public async rewriteQuery(originalQuery: string): Promise<string> {
    if (!originalQuery || originalQuery.trim().length < 15) {
      return originalQuery;
    }

    try {
      const response = await llmGatewayService.generate({
        prompt: `Rewrite the following user query to optimize document retrieval and keyword search. Keep the exact technical terms, API endpoints, function names, and entity names intact. Return ONLY the single rewritten query string without quotes or preamble.\n\nUser Query: "${originalQuery}"`,
        systemPrompt: 'You are a search query expansion assistant. Output only the rewritten query.',
        temperature: 0.2,
        maxTokens: 100,
        timeoutMs: 3000
      });

      const rewritten = response.text.trim().replace(/^["']|["']$/g, '');
      return rewritten && rewritten.length > 5 ? rewritten : originalQuery;
    } catch {
      // Fallback cleanly to original query on any failure
      return originalQuery;
    }
  }
}

export const queryRewriteService = new QueryRewriteService();
