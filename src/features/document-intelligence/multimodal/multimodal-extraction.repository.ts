import { prisma } from '@/lib/prisma';
import type { DocumentMultimodalRun, DocumentMultimodalStage } from '@prisma/client';
import type { ExtractedTableDTO } from './multimodal.types';

export interface UpsertMultimodalRunInput {
  documentId: string;
  userId: string;
  ocrEnabled: boolean;
  tableExtractionEnabled: boolean;
  imageAnalysisEnabled: boolean;
  chartExtractionEnabled: boolean;
}

export class MultimodalExtractionRepository {
  public async upsertRun(input: UpsertMultimodalRunInput): Promise<DocumentMultimodalRun> {
    const flags = {
      ocrEnabled: input.ocrEnabled,
      tableExtractionEnabled: input.tableExtractionEnabled,
      imageAnalysisEnabled: input.imageAnalysisEnabled,
      chartExtractionEnabled: input.chartExtractionEnabled
    };

    return prisma.documentMultimodalRun.upsert({
      where: { documentId: input.documentId },
      create: {
        documentId: input.documentId,
        userId: input.userId,
        status: 'PROCESSING',
        startedAt: new Date(),
        attempts: 1,
        ...flags
      },
      update: {
        status: 'PROCESSING',
        startedAt: new Date(),
        completedAt: null,
        errorCode: null,
        errorMessage: null,
        attempts: { increment: 1 },
        ...flags
      }
    });
  }

  public async markStage(documentId: string, stage: DocumentMultimodalStage): Promise<void> {
    await prisma.documentMultimodalRun.updateMany({ where: { documentId }, data: { stage } });
  }

  public async markCompleted(
    documentId: string,
    counts: { tablesExtracted: number; imagesFound: number; imagesAnalyzed: number; chartsExtracted: number },
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await prisma.documentMultimodalRun.updateMany({
      where: { documentId },
      data: {
        status: 'COMPLETED',
        stage: 'DONE',
        completedAt: new Date(),
        tablesExtracted: counts.tablesExtracted,
        imagesFound: counts.imagesFound,
        imagesAnalyzed: counts.imagesAnalyzed,
        chartsExtracted: counts.chartsExtracted,
        metadata: (metadata as object) ?? {}
      }
    });
  }

  public async markFailed(documentId: string, errorCode: string, errorMessage: string): Promise<void> {
    await prisma.documentMultimodalRun.updateMany({
      where: { documentId },
      data: { status: 'FAILED', completedAt: new Date(), errorCode, errorMessage }
    });
  }

  public async getByDocumentId(documentId: string): Promise<DocumentMultimodalRun | null> {
    return prisma.documentMultimodalRun.findUnique({ where: { documentId } });
  }

  public async saveExtractedTables(documentId: string, tables: ExtractedTableDTO[]): Promise<void> {
    if (tables.length === 0) return;
    await prisma.extractedTable.createMany({
      data: tables.map((t) => ({
        documentId,
        pageNumber: t.pageNumber,
        tableIndex: t.tableIndex,
        title: t.title,
        headers: t.headers,
        rows: t.rows,
        markdownRepresentation: t.markdownRepresentation,
        extractionConfidence: t.extractionConfidence,
        extractionProvider: t.extractionProvider
      }))
    });
  }

  /**
   * Replaces only the multimodal-table chunks (identified by `metadata.chunkingStrategy ===
   * 'multimodal_table'`) for this document — deliberately NOT the worker's saveChunksTx
   * delete-then-reinsert path, which would wipe the unrelated 69A text/semantic chunks. Scoping
   * the delete to just this subset makes re-running table extraction (including from a Phase 69D
   * re-index) idempotent: a second run replaces the first run's table chunks rather than
   * duplicating them. chunkIndex continues from the current max of whatever remains.
   */
  public async replaceTableChunks(
    documentId: string,
    chunks: Array<{ pageNumber: number; content: string; tokenCount: number; metadata: Record<string, unknown> }>
  ): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({
        where: { documentId, metadata: { path: ['chunkingStrategy'], equals: 'multimodal_table' } }
      });

      if (chunks.length === 0) return;

      const maxIndexRow = await tx.documentChunk.aggregate({
        where: { documentId },
        _max: { chunkIndex: true }
      });
      let nextIndex = (maxIndexRow._max.chunkIndex ?? -1) + 1;

      await tx.documentChunk.createMany({
        data: chunks.map((c) => ({
          documentId,
          chunkIndex: nextIndex++,
          content: c.content,
          pageNumber: c.pageNumber,
          tokenCount: c.tokenCount,
          metadata: c.metadata as object
        }))
      });
    });
  }
}

export const multimodalExtractionRepository = new MultimodalExtractionRepository();
