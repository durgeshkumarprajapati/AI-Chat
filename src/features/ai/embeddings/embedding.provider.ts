import { ai } from '@/lib/openai';

export interface IEmbeddingProvider {
  embed(_text: string): Promise<number[]>;
  embedBatch(_texts: string[]): Promise<number[][]>;
}

export class OpenAIEmbeddingProvider implements IEmbeddingProvider {
  public async embed(text: string): Promise<number[]> {
    return ai.generateEmbedding(text);
  }

  public async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }
}

export const embeddingProvider: IEmbeddingProvider = new OpenAIEmbeddingProvider();
