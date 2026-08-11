import { prisma } from '@/lib/prisma';

export interface VectorSearchResult {
  chunkId: string;
  documentId: string;
  filename: string;
  content: string;
  pageNumber: number;
  score: number;
}

export class VectorRetrievalService {
  /**
   * Performs vector similarity search enforcing tenant/user authorization.
   * Filters results by documents belonging exclusively to the specified userId.
   */
  public async searchSimilarChunks(
    userId: string,
    queryEmbedding: number[],
    topK = 5
  ): Promise<VectorSearchResult[]> {
    if (!queryEmbedding || queryEmbedding.length === 0) {
      return [];
    }

    const vectorSql = `[${queryEmbedding.join(',')}]`;

    // SQL query enforcing currentUser -> authorized document -> document chunks
    const results = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        document_id: string;
        filename: string;
        content: string;
        page_number: number;
        similarity: number;
      }>
    >(
      `
      SELECT 
        dc.id,
        dc.document_id,
        d.filename,
        dc.content,
        dc.page_number,
        1 - (dc.embedding <=> $1::vector) AS similarity
      FROM document_chunks dc
      INNER JOIN documents d ON dc.document_id = d.id
      WHERE d.user_id = $2 AND dc.embedding IS NOT NULL
      ORDER BY dc.embedding <=> $1::vector ASC
      LIMIT $3;
      `,
      vectorSql,
      userId,
      topK
    );

    return results.map((r) => ({
      chunkId: r.id,
      documentId: r.document_id,
      filename: r.filename,
      content: r.content,
      pageNumber: r.page_number,
      score: r.similarity
    }));
  }
}

export const vectorRetrievalService = new VectorRetrievalService();
