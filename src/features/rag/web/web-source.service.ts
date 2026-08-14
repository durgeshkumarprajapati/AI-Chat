import { prisma } from '@/lib/prisma';
import { env } from '@/config/env';
import { NotFoundError, ValidationError } from '@/errors';
import { webUrlValidator } from './web-url.validator';
import { webFetcher } from './web-fetcher';
import { webContentExtractor } from './web-content-extractor';
import { CreateWebSourceInput, RefreshWebSourceResult, WebSourceDetail } from './web-source.types';
import { getEmbeddingProvider } from '@/features/documents/embeddings/embedding.provider.factory';
import { storage } from '@/lib/storage';
import { getRAGCacheProvider } from '../cache/rag-cache.factory';
import { SourceType } from '@prisma/client';

export class WebSourceService {
  /**
   * Registers, fetches, chunks, embeds, and indexes a new web page source.
   */
  public async createWebSource(userId: string, input: CreateWebSourceInput): Promise<WebSourceDetail> {
    if (!env.server?.WEB_RAG_ENABLED) {
      throw new ValidationError('Web RAG feature is currently disabled.');
    }

    // 1. Ensure User record exists to prevent foreign key violation
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: `${userId}@user.local`,
        name: `User ${userId.slice(0, 8)}`
      }
    });

    // 2. Validate URL for SSRF protection
    const safeUrl = await webUrlValidator.assertSafeUrl(input.url);

    // 2. Check user limit
    const existingCount = await prisma.document.count({
      where: { userId, sourceType: SourceType.WEB }
    });

    const maxLimit = env.server?.WEB_MAX_SOURCES_PER_USER ?? 100;
    if (existingCount >= maxLimit) {
      throw new ValidationError(`Maximum limit of ${maxLimit} web sources per user reached.`);
    }

    // 3. If Knowledge Base provided, verify ownership and KB limit
    if (input.knowledgeBaseId) {
      const kb = await prisma.knowledgeBase.findFirst({
        where: { id: input.knowledgeBaseId, userId },
        include: { _count: { select: { documents: true } } }
      });
      if (!kb) {
        throw new NotFoundError('Knowledge Base');
      }

      const maxKbLimit = env.server?.WEB_MAX_SOURCES_PER_KB ?? 50;
      if (kb._count.documents >= maxKbLimit) {
        throw new ValidationError(`Knowledge Base exceeds maximum limit of ${maxKbLimit} sources.`);
      }
    }

    // 4. Fetch web content
    console.log(`[WebSourceService] Fetching URL: ${safeUrl.toString()}...`);
    const fetchResult = await webFetcher.fetchUrl(safeUrl.toString());

    // 5. Extract clean text & metadata
    const extractResult = webContentExtractor.extract(fetchResult.html, fetchResult.finalUrl);
    if (!extractResult.textContent || extractResult.textContent.trim().length === 0) {
      throw new ValidationError(`Could not extract readable text content from URL "${input.url}".`);
    }

    // 6. Create Document record in PostgreSQL (sourceType = WEB)
    const docId = `web-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const storageKey = `web/${userId}/${docId}.txt`;

    // Save text in storage provider
    await storage.upload(storageKey, Buffer.from(extractResult.textContent, 'utf-8'), 'text/plain');

    const document = await prisma.document.create({
      data: {
        id: docId,
        userId,
        sourceType: SourceType.WEB,
        filename: extractResult.title,
        originalFilename: input.url,
        mimeType: 'text/html',
        fileSize: Buffer.byteLength(extractResult.textContent, 'utf-8'),
        storageKey,
        webUrl: input.url,
        canonicalUrl: extractResult.canonicalUrl,
        contentHash: extractResult.contentHash,
        fetchedAt: new Date(),
        status: 'PROCESSING',
        pageCount: 1,
        knowledgeBases: input.knowledgeBaseId
          ? {
              create: {
                knowledgeBaseId: input.knowledgeBaseId
              }
            }
          : undefined
      }
    });

    try {
      // 7. Token-aware text chunking (500 tokens with 100 token overlap)
      const chunks = this.chunkText(extractResult.textContent, 500, 100);

      // Save chunks in database
      const createdChunks = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunkObj = await prisma.documentChunk.create({
          data: {
            documentId: document.id,
            chunkIndex: i,
            pageNumber: 1,
            content: chunks[i]!.content,
            tokenCount: chunks[i]!.tokenCount,
            metadata: {
              sourceType: 'WEB',
              webUrl: input.url,
              canonicalUrl: extractResult.canonicalUrl,
              title: extractResult.title
            }
          }
        });
        createdChunks.push(chunkObj);
      }

      // 8. Generate & persist pgvector embeddings
      const embeddingProvider = getEmbeddingProvider();
      for (const chunk of createdChunks) {
        const [embedding] = await embeddingProvider.embedTexts([chunk.content]);
        if (embedding) {
          const vectorString = `[${embedding.join(',')}]`;
          await prisma.$executeRawUnsafe(
            `UPDATE document_chunks SET embedding = $1::vector WHERE id = $2`,
            vectorString,
            chunk.id
          );
        }
      }

      // 9. Update Document status to COMPLETED
      const updatedDoc = await prisma.document.update({
        where: { id: document.id },
        data: { status: 'COMPLETED' },
        include: {
          knowledgeBases: {
            include: { knowledgeBase: true }
          }
        }
      });

      // 10. Invalidate RAG Cache
      const cacheProvider = getRAGCacheProvider();
      await cacheProvider.invalidateUser(userId);

      return this.mapToDetail(updatedDoc);
    } catch (err) {
      console.error(`[WebSourceService] Failed to ingest web source ${docId}:`, err);
      await prisma.document.update({
        where: { id: document.id },
        data: { status: 'FAILED', errorMessage: err instanceof Error ? err.message : String(err) }
      });
      throw err;
    }
  }

  /**
   * Refreshes content for an existing web source idempotently.
   */
  public async refreshWebSource(userId: string, sourceId: string): Promise<RefreshWebSourceResult> {
    const doc = await prisma.document.findFirst({
      where: { id: sourceId, userId, sourceType: SourceType.WEB }
    });

    if (!doc) {
      throw new NotFoundError('Web Source');
    }

    if (!doc.webUrl) {
      throw new ValidationError('Document is missing webUrl property');
    }

    const safeUrl = await webUrlValidator.assertSafeUrl(doc.webUrl);
    const fetchResult = await webFetcher.fetchUrl(safeUrl.toString());
    const extractResult = webContentExtractor.extract(fetchResult.html, fetchResult.finalUrl);

    // Idempotency check using contentHash
    if (doc.contentHash === extractResult.contentHash) {
      await prisma.document.update({
        where: { id: doc.id },
        data: { fetchedAt: new Date() }
      });
      return {
        status: 'UNCHANGED',
        contentHash: extractResult.contentHash,
        fetchedAt: new Date().toISOString(),
        message: 'Web content has not changed since last fetch.'
      };
    }

    // Reprocess content safely
    await prisma.documentChunk.deleteMany({ where: { documentId: doc.id } });
    await storage.upload(doc.storageKey, Buffer.from(extractResult.textContent, 'utf-8'), 'text/plain');

    const chunks = this.chunkText(extractResult.textContent, 500, 100);
    const embeddingProvider = getEmbeddingProvider();

    for (let i = 0; i < chunks.length; i++) {
      const chunkObj = await prisma.documentChunk.create({
        data: {
          documentId: doc.id,
          chunkIndex: i,
          pageNumber: 1,
          content: chunks[i]!.content,
          tokenCount: chunks[i]!.tokenCount,
          metadata: {
            sourceType: 'WEB',
            webUrl: doc.webUrl,
            canonicalUrl: extractResult.canonicalUrl,
            title: extractResult.title
          }
        }
      });

      const [embedding] = await embeddingProvider.embedTexts([chunkObj.content]);
      if (embedding) {
        const vectorString = `[${embedding.join(',')}]`;
        await prisma.$executeRawUnsafe(
          `UPDATE document_chunks SET embedding = $1::vector WHERE id = $2`,
          vectorString,
          chunkObj.id
        );
      }
    }

    await prisma.document.update({
      where: { id: doc.id },
      data: {
        filename: extractResult.title,
        canonicalUrl: extractResult.canonicalUrl,
        contentHash: extractResult.contentHash,
        fetchedAt: new Date(),
        status: 'COMPLETED',
        version: { increment: 1 }
      }
    });

    const cacheProvider = getRAGCacheProvider();
    await cacheProvider.invalidateUser(userId);

    return {
      status: 'REFRESHED',
      contentHash: extractResult.contentHash,
      fetchedAt: new Date().toISOString(),
      message: 'Web content refreshed and re-indexed successfully.'
    };
  }

  public async listWebSources(userId: string): Promise<WebSourceDetail[]> {
    const docs = await prisma.document.findMany({
      where: { userId, sourceType: SourceType.WEB },
      include: {
        knowledgeBases: {
          include: { knowledgeBase: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return docs.map((d) => this.mapToDetail(d));
  }

  public async getWebSource(userId: string, sourceId: string): Promise<WebSourceDetail> {
    const doc = await prisma.document.findFirst({
      where: { id: sourceId, userId, sourceType: SourceType.WEB },
      include: {
        knowledgeBases: {
          include: { knowledgeBase: true }
        }
      }
    });

    if (!doc) {
      throw new NotFoundError('Web Source');
    }

    return this.mapToDetail(doc);
  }

  public async deleteWebSource(userId: string, sourceId: string): Promise<void> {
    const doc = await prisma.document.findFirst({
      where: { id: sourceId, userId, sourceType: SourceType.WEB }
    });

    if (!doc) {
      throw new NotFoundError('Web Source');
    }

    await prisma.document.delete({ where: { id: sourceId } });
    await storage.delete(doc.storageKey).catch(() => {});

    const cacheProvider = getRAGCacheProvider();
    await cacheProvider.invalidateUser(userId);
  }

  private chunkText(text: string, chunkSize = 500, overlap = 100): Array<{ content: string; tokenCount: number }> {
    const words = text.split(/\s+/).filter(Boolean);
    const chunks: Array<{ content: string; tokenCount: number }> = [];

    let start = 0;
    while (start < words.length) {
      const end = Math.min(words.length, start + chunkSize);
      const chunkWords = words.slice(start, end);
      const content = chunkWords.join(' ');
      const tokenCount = Math.ceil(content.length / 4);

      chunks.push({ content, tokenCount });

      if (end >= words.length) break;
      start += chunkSize - overlap;
    }

    return chunks;
  }

  private mapToDetail(doc: any): WebSourceDetail {
    return {
      id: doc.id,
      userId: doc.userId,
      url: doc.webUrl || doc.originalFilename,
      canonicalUrl: doc.canonicalUrl,
      title: doc.filename,
      status: doc.status,
      contentHash: doc.contentHash,
      fetchedAt: doc.fetchedAt ? doc.fetchedAt.toISOString() : null,
      errorMessage: doc.errorMessage,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      knowledgeBases: doc.knowledgeBases
        ? doc.knowledgeBases.map((kbDoc: any) => ({
            id: kbDoc.knowledgeBase.id,
            name: kbDoc.knowledgeBase.name
          }))
        : []
    };
  }
}

export const webSourceService = new WebSourceService();
