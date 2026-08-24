import { prisma } from '@/lib/prisma';
import { RetrievedChunk, RetrievalOptions } from './retrieval.types';

export class KeywordRetriever {
  public async retrieve(
    userId: string,
    query: string,
    options?: RetrievalOptions
  ): Promise<RetrievedChunk[]> {
    if (!query || !query.trim()) return [];

    const keywordK = options?.keywordK || 20;
    const sourceMode = options?.sourceMode || 'documents_only';
    const isWebOnly = sourceMode === 'web_only';
    const isDocOnly = sourceMode === 'documents_only';
    const kbId = options?.knowledgeBaseId;

    try {
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
              rank: number;
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
              ts_rank_cd(to_tsvector('english', dc.content), plainto_tsquery('english', ${query})) as rank
            FROM document_chunks dc
            INNER JOIN documents d ON d.id = dc.document_id
            WHERE d.user_id = ${userId} 
              AND to_tsvector('english', dc.content) @@ plainto_tsquery('english', ${query})
              AND (${!isDocOnly} OR d.source_type = 'DOCUMENT' OR d.source_type IS NULL)
              AND (${!isWebOnly} OR d.source_type = 'WEB')
              AND EXISTS (
                SELECT 1 FROM knowledge_base_documents kbd
                WHERE kbd.document_id = d.id AND kbd.knowledge_base_id = ${kbId}
              )
            ORDER BY rank DESC
            LIMIT ${keywordK}
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
              rank: number;
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
              ts_rank_cd(to_tsvector('english', dc.content), plainto_tsquery('english', ${query})) as rank
            FROM document_chunks dc
            INNER JOIN documents d ON d.id = dc.document_id
            WHERE d.user_id = ${userId} 
              AND to_tsvector('english', dc.content) @@ plainto_tsquery('english', ${query})
              AND (${!isDocOnly} OR d.source_type = 'DOCUMENT' OR d.source_type IS NULL)
              AND (${!isWebOnly} OR d.source_type = 'WEB')
            ORDER BY rank DESC
            LIMIT ${keywordK}
          `;

      const maxRank = rows.reduce((max, r) => Math.max(max, Number(r.rank) || 0), 0) || 1.0;

      return rows.map((r) => {
        const normRank = Math.min(1.0, (Number(r.rank) || 0) / maxRank);
        return {
          id: r.id,
          documentId: r.documentId,
          filename: r.filename,
          chunkIndex: r.chunkIndex,
          pageNumber: r.pageNumber,
          content: r.content,
          tokenCount: r.tokenCount,
          similarity: normRank,
          keywordScore: Number(normRank.toFixed(4)),
          retrievalSource: 'keyword',
          sourceType: r.sourceType || 'DOCUMENT',
          webUrl: r.webUrl,
          canonicalUrl: r.canonicalUrl,
          metadata: (r.metadata as Record<string, unknown>) || {}
        };
      });
    } catch {
      return [];
    }
  }
}

export const keywordRetriever = new KeywordRetriever();
