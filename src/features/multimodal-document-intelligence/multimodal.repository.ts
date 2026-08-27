import { prisma } from '@/lib/prisma';
import type { DocumentMultimodalRun, DocumentMultimodalStage } from '@prisma/client';
import type { ExtractedChartDTO, ExtractedImageDTO, ExtractedTableDTO } from './multimodal.types';
import type { MultimodalChunkBuildOutput } from './indexing/multimodal-chunk-builder.service';

export interface UpsertMultimodalRunParams {
  documentId: string;
  userId: string;
  ocrEnabled: boolean;
  tableExtractionEnabled: boolean;
  imageAnalysisEnabled: boolean;
  chartExtractionEnabled: boolean;
}

export class MultimodalRepository {
  public async upsertRun(input: UpsertMultimodalRunParams): Promise<DocumentMultimodalRun> {
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

  public async saveExtractedImages(documentId: string, images: ExtractedImageDTO[]): Promise<void> {
    if (images.length === 0) return;
    await prisma.documentImage.createMany({
      data: images.map((img) => ({
        documentId,
        pageNumber: img.pageNumber,
        imageIndex: img.imageIndex,
        storageKey: img.storageKey,
        mimeType: img.mimeType || 'image/png',
        ocrText: img.ocrText,
        ocrProvider: img.ocrProvider,
        visionDescription: img.visionDescription,
        visionEntities: img.visionEntities || [],
        visionProvider: img.visionProvider,
        visionConfidence: img.visionConfidence ?? 0.85
      }))
    });
  }

  public async saveExtractedCharts(documentId: string, charts: ExtractedChartDTO[]): Promise<void> {
    if (charts.length === 0) return;
    await prisma.documentChart.createMany({
      data: charts.map((ch) => ({
        documentId,
        pageNumber: ch.pageNumber,
        chartIndex: ch.chartIndex,
        storageKey: ch.storageKey,
        chartType: ch.chartType,
        description: ch.description,
        extractedDataPoints: ch.extractedDataPoints || [],
        confidence: ch.confidence ?? 0.85,
        provider: ch.provider
      }))
    });
  }

  /**
   * Idempotently replaces multimodal intelligence chunks for the document without deleting unrelated text/69A chunks.
   */
  public async replaceMultimodalChunks(documentId: string, chunks: MultimodalChunkBuildOutput[]): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({
        where: { documentId, metadata: { path: ['chunkingStrategy'], equals: 'multimodal_intelligence' } }
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

export const multimodalRepository = new MultimodalRepository();
