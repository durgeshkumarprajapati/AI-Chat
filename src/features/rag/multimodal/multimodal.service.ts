import { prisma } from '@/lib/prisma';
import { env } from '@/config/env';
import { MultimodalAnalysisResult, VisualContentType } from './multimodal.types';
import { tableExtractorService } from './table-extractor.service';
import { defaultOCRProvider } from './ocr.provider';
import { defaultVisionProvider } from './vision.provider';
import { getStorageProvider } from '@/lib/storage';
import { createHash } from 'crypto';
import { configService } from '@/features/config';

export class MultimodalService {
  /**
   * Processes, extracts, analyzes, and stores visual elements (tables, images, charts, diagrams, OCR) from PDF documents.
   */
  public async processDocumentVisuals(
    userId: string,
    documentId: string,
    pageTextMap: Map<number, string>,
    imageInputs?: Array<{ pageNumber: number; buffer: Buffer; caption?: string; type?: VisualContentType }>
  ): Promise<MultimodalAnalysisResult> {
    const startTime = Date.now();
    const result: MultimodalAnalysisResult = {
      visuals: [],
      chunks: [],
      metrics: {
        extractionMs: 0,
        ocrMs: 0,
        tableExtractionMs: 0,
        visionMs: 0,
        embeddingMs: 0,
        totalMs: 0,
        imagesExtracted: 0,
        tablesExtracted: 0,
        ocrPagesProcessed: 0,
        visionCallsMade: 0
      }
    };

    if (!env.server?.MULTIMODAL_ENABLED) {
      return result;
    }

    const storageProvider = getStorageProvider();

    // 1. Table Extraction from Page Text
    const tableStart = Date.now();
    for (const [pageNumber, pageText] of pageTextMap.entries()) {
      const parsedTables = tableExtractorService.extractTablesFromText(pageText, pageNumber);
      for (const t of parsedTables) {
        result.metrics.tablesExtracted++;
        const contentHash = createHash('md5').update(t.markdownText).digest('hex');
        const visualRecord = await prisma.documentVisual.create({
          data: {
            documentId,
            pageNumber: t.pageNumber,
            type: 'TABLE',
            contentHash,
            caption: `Table ${t.tableIndex + 1} on Page ${t.pageNumber}`,
            ocrText: t.markdownText,
            metadata: {
              headers: t.headers,
              rowCount: t.rowCount,
              columnCount: t.columnCount,
              structuredData: t.structuredData
            },
            confidence: 0.95
          }
        });

        result.visuals.push(visualRecord as any);
        result.chunks.push({
          content: `[TABLE: Page ${t.pageNumber}]\n${t.markdownText}`,
          pageNumber: t.pageNumber,
          visualType: 'TABLE',
          visualId: visualRecord.id,
          metadata: {
            isVisual: true,
            visualType: 'TABLE',
            visualId: visualRecord.id,
            pageNumber: t.pageNumber
          }
        });
      }
    }
    result.metrics.tableExtractionMs = Date.now() - tableStart;

    // 2. Image, OCR & Vision Processing
    if (imageInputs && imageInputs.length > 0) {
      const imgStart = Date.now();
      const maxImages = env.server?.MULTIMODAL_MAX_IMAGES_PER_DOCUMENT ?? 30;
      const processBatch = imageInputs.slice(0, maxImages);

      // Phase 77: each image's upload/OCR/vision/DB-write is independent of every other
      // image's — processed in bounded-concurrency batches instead of one at a time. Per-image
      // work is computed into a plain result object first; metrics increments and
      // result.visuals/result.chunks pushes happen afterward in a single pass over
      // `processBatch`'s ORIGINAL order (not resolution order), so the final arrays and
      // cumulative counters are byte-identical to the previous fully-sequential version —
      // only wall-clock time changes.
      const concurrency = await configService.getNumber('MULTIMODAL_IMAGE_PROCESSING_CONCURRENCY', 3);

      const processImage = async (img: (typeof processBatch)[number]) => {
        const visualType: VisualContentType = img.type || 'IMAGE';
        const contentHash = createHash('md5').update(img.buffer).digest('hex');

        const storageKey = `documents/${userId}/${documentId}/visuals/${contentHash.slice(0, 16)}.png`;
        try {
          await storageProvider.upload(storageKey, img.buffer, 'image/png');
        } catch (storageErr) {
          console.warn(`[MultimodalService] Image storage failed for ${storageKey}:`, storageErr);
        }

        let ocrText = '';
        let ocrMs = 0;
        let didOcr = false;
        if (env.server?.MULTIMODAL_OCR_ENABLED) {
          const ocrStart = Date.now();
          const ocrRes = await defaultOCRProvider.extractText(img.buffer);
          ocrMs = Date.now() - ocrStart;
          didOcr = true;
          ocrText = ocrRes.text;
        }

        let visionDescription = '';
        let visionMs = 0;
        let didVision = false;
        if (env.server?.MULTIMODAL_VISION_ENABLED) {
          const visionStart = Date.now();
          const visionRes = await defaultVisionProvider.analyzeVisualContent(img.buffer, visualType, img.caption);
          visionMs = Date.now() - visionStart;
          didVision = true;
          visionDescription = visionRes.description;
        }

        const captionText = img.caption || visionDescription || ocrText || `Visual Element on Page ${img.pageNumber}`;
        const visualRecord = await prisma.documentVisual.create({
          data: {
            documentId,
            pageNumber: img.pageNumber,
            type: visualType,
            storageKey,
            contentHash,
            caption: captionText,
            ocrText: ocrText || visionDescription,
            metadata: {
              isVisualAsset: true,
              visualType,
              hasVisionDescription: Boolean(visionDescription)
            },
            confidence: 0.9
          }
        });

        const fullVisualText = `[${visualType}: Page ${img.pageNumber}]\n${captionText}${ocrText ? '\nOCR Text: ' + ocrText : ''}`;

        return {
          visualRecord,
          ocrMs,
          didOcr,
          visionMs,
          didVision,
          chunkEntry: {
            content: fullVisualText,
            pageNumber: img.pageNumber,
            visualType,
            visualId: visualRecord.id,
            metadata: {
              isVisual: true,
              visualType,
              visualId: visualRecord.id,
              pageNumber: img.pageNumber,
              storageKey
            }
          }
        };
      };

      const processedResults: Array<Awaited<ReturnType<typeof processImage>>> = [];
      for (let batchStart = 0; batchStart < processBatch.length; batchStart += concurrency) {
        const batchSlice = processBatch.slice(batchStart, batchStart + concurrency);
        const batchResults = await Promise.all(batchSlice.map(processImage));
        processedResults.push(...batchResults);
      }

      for (const r of processedResults) {
        result.metrics.imagesExtracted++;
        if (r.didOcr) {
          result.metrics.ocrMs += r.ocrMs;
          result.metrics.ocrPagesProcessed++;
        }
        if (r.didVision) {
          result.metrics.visionMs += r.visionMs;
          result.metrics.visionCallsMade++;
        }
        result.visuals.push(r.visualRecord as any);
        result.chunks.push(r.chunkEntry);
      }

      result.metrics.extractionMs = Date.now() - imgStart;
    }

    result.metrics.totalMs = Date.now() - startTime;
    return result;
  }

  /**
   * Retrieves visual records for a document.
   */
  public async getVisualsForDocument(documentId: string) {
    return prisma.documentVisual.findMany({
      where: { documentId },
      orderBy: [{ pageNumber: 'asc' }, { createdAt: 'asc' }]
    });
  }
}

export const multimodalService = new MultimodalService();
