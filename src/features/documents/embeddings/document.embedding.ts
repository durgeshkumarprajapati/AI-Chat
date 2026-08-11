import { ai } from '@/lib/openai';
import { Chunk } from '../chunking/text.chunker';

export interface ChunkWithEmbedding extends Chunk {
  embedding: number[];
}

export class DocumentEmbeddingService {
  public async generateChunkEmbeddings(chunks: Chunk[]): Promise<ChunkWithEmbedding[]> {
    const results: ChunkWithEmbedding[] = [];

    for (const chunk of chunks) {
      const embedding = await ai.generateEmbedding(chunk.content);
      results.push({
        ...chunk,
        embedding
      });
    }

    return results;
  }
}

export const documentEmbeddingService = new DocumentEmbeddingService();
