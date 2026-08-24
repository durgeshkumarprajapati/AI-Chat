import { prisma } from '@/lib/prisma';
import { RetrievedChunk, RetrievalOptions } from './retrieval.types';
import { getEmbeddingProvider } from '@/features/documents/embeddings/embedding.provider.factory';

export class VectorRetriever {
  public async retrieve(
    userId: string,
    query: string,
    options?: RetrievalOptions
  ): Promise<RetrievedChunk[]> {
    if (!query || !query.trim()) return [];

    const vectorK = options?.vectorK || 20;
    let queryVector = options?.queryVector;

    if (!queryVector) {
      const provider = getEmbeddingProvider();
      const vectors = await provider.embedTexts([query]);
      queryVector = vectors[0];
    }

    if (!queryVector || queryVector.length === 0) return [];

    const vectorStr = `[${queryVector.join(',')}]`;
    const sourceMode = options?.sourceMode || 'documents_only';
    const isWebOnly = sourceMode === 'web_only';
    const isDocOnly = sourceMode === 'documents_only';

    const kbId = options?.knowledgeBaseId;

    const rows = kbId
      ? await prisma.$queryRaw<
          Array<{
            id: string;
            documentId: string;
            filename: string;
            chunkIndex: number;
            pageNumber: number;
            content: string;
            tokenCount: number;
            metadata: Record<string, unknown>;
            similarity: number;
            sourceType: 'DOCUMENT' | 'WEB';
            webUrl?: string;
            canonicalUrl?: string;
          }>
        >`
          SELECT 
            dc.id,
            dc.document_id as "documentId",
            d.filename,
            dc.chunk_index as "chunkIndex",
            dc.page_number as "pageNumber",
            dc.content,
            dc.token_count as "tokenCount",
            dc.metadata,
            d.source_type as "sourceType",
            d.web_url as "webUrl",
            d.canonical_url as "canonicalUrl",
            (1 - (dc.embedding <=> ${vectorStr}::vector)) as similarity
          FROM document_chunks dc
          INNER JOIN documents d ON d.id = dc.document_id
          WHERE d.user_id = ${userId} 
            AND dc.embedding IS NOT NULL
            AND (${!isDocOnly} OR d.source_type = 'DOCUMENT' OR d.source_type IS NULL)
            AND (${!isWebOnly} OR d.source_type = 'WEB')
            AND EXISTS (
              SELECT 1 FROM knowledge_base_documents kbd
              WHERE kbd.document_id = d.id AND kbd.knowledge_base_id = ${kbId}
            )
          ORDER BY dc.embedding <=> ${vectorStr}::vector ASC
          LIMIT ${vectorK}
        `
      : await prisma.$queryRaw<
          Array<{
            id: string;
            documentId: string;
            filename: string;
            chunkIndex: number;
            pageNumber: number;
            content: string;
            tokenCount: number;
            metadata: Record<string, unknown>;
            similarity: number;
            sourceType: 'DOCUMENT' | 'WEB';
            webUrl?: string;
            canonicalUrl?: string;
          }>
        >`
          SELECT 
            dc.id,
            dc.document_id as "documentId",
            d.filename,
            dc.chunk_index as "chunkIndex",
            dc.page_number as "pageNumber",
            dc.content,
            dc.token_count as "tokenCount",
            dc.metadata,
            d.source_type as "sourceType",
            d.web_url as "webUrl",
            d.canonical_url as "canonicalUrl",
            (1 - (dc.embedding <=> ${vectorStr}::vector)) as similarity
          FROM document_chunks dc
          INNER JOIN documents d ON d.id = dc.document_id
          WHERE d.user_id = ${userId} 
            AND dc.embedding IS NOT NULL
            AND (${!isDocOnly} OR d.source_type = 'DOCUMENT' OR d.source_type IS NULL)
            AND (${!isWebOnly} OR d.source_type = 'WEB')
          ORDER BY dc.embedding <=> ${vectorStr}::vector ASC
          LIMIT ${vectorK}
        `;

    return rows.map((r) => ({
      id: r.id,
      documentId: r.documentId,
      filename: r.filename,
      chunkIndex: r.chunkIndex,
      pageNumber: r.pageNumber,
      content: r.content,
      tokenCount: r.tokenCount,
      similarity: Number(r.similarity),
      vectorScore: Number(Number(r.similarity).toFixed(4)),
      retrievalSource: 'vector',
      sourceType: r.sourceType || 'DOCUMENT',
      webUrl: r.webUrl,
      canonicalUrl: r.canonicalUrl,
      metadata: (r.metadata as Record<string, unknown>) || {}
    }));
  }
}

export const vectorRetriever = new VectorRetriever();
