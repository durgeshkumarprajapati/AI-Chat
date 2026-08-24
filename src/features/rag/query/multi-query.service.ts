import { llmGatewayService } from '@/features/llm';
import { RAGConfigService } from '../rag.config';

export class MultiQueryService {
  /**
   * Generates multiple search query variations for complex questions.
   * ALWAYS preserves originalQuery as the first element in the returned array.
   */
  public async generateMultiQueries(originalQuery: string): Promise<string[]> {
    const maxQueries = RAGConfigService.getMaxRetrievalQueries();
    const resultQueries = [originalQuery];

    if (!originalQuery || originalQuery.trim().length < 15 || maxQueries <= 1) {
      return resultQueries;
    }

    try {
      const prompt = `Given the user question, generate up to ${
        maxQueries - 1
      } alternative retrieval queries that capture different aspects, technical perspectives, or synonyms of the question.
Output each query on a new line without numbers or bullet points.

Question: "${originalQuery}"`;

      const res = await llmGatewayService.generate({
        prompt,
        systemPrompt: 'You are a multi-query retrieval generator. Output one query per line.',
        temperature: 0.3,
        maxTokens: 250,
        timeoutMs: 4000
      });

      const lines = res.text
        .split('\n')
        .map((l: string) => l.replace(/^[\d\.\-\*\s]+/, '').trim())
        .filter((l: string) => l.length > 5);

      for (const line of lines) {
        if (!resultQueries.some((q) => q.toLowerCase() === line.toLowerCase())) {
          resultQueries.push(line);
        }
        if (resultQueries.length >= maxQueries) break;
      }
    } catch {
      // Fallback safely to original query
    }

    return resultQueries;
  }
}

export const multiQueryService = new MultiQueryService();
