import { getMultimodalConfig, MultimodalConfig } from './multimodal.config';
import { multimodalRepository } from './multimodal.repository';
import { scannedDocumentDetector } from './detection/scanned-document-detector';
import { ocrService } from './ocr/ocr.service';
import { tableExtractionService } from './tables/table-extraction.service';
import { imageAnalysisService } from './images/image-analysis.service';
import { chartAnalysisService } from './charts/chart-analysis.service';
import { multimodalChunkBuilderService, MultimodalChunkBuildOutput } from './indexing/multimodal-chunk-builder.service';
import { multimodalTelemetryService } from './telemetry/multimodal-telemetry.service';
import { ExtractedChartDTO, ExtractedImageDTO, ExtractedTableDTO, MultimodalDocumentAnalysisResult } from './multimodal.types';
import type { ParsedDocumentLike } from '@/features/document-intelligence/document-intelligence.types';

export interface MultimodalProcessInput {
  documentId: string;
  userId: string;
  parsedDocument: ParsedDocumentLike;
}

export class MultimodalOrchestratorService {
  public async process(input: MultimodalProcessInput): Promise<MultimodalDocumentAnalysisResult> {
    const startTime = Date.now();
    const config = getMultimodalConfig();

    if (!config.enabled) {
      return {
        handled: false,
        reason: 'DISABLED',
        tablesExtracted: 0,
        imagesFound: 0,
        imagesAnalyzed: 0,
        chartsExtracted: 0,
        ocrPagesProcessed: 0,
        durationMs: Date.now() - startTime
      };
    }

    multimodalTelemetryService.logEvent({
      event: 'multimodal.processing.started',
      documentId: input.documentId,
      tenantId: input.userId
    });

    try {
      return await this.run(input, config, startTime);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[MultimodalOrchestratorService] Multimodal intelligence threw for document ${input.documentId}:`, err);

      try {
        await multimodalRepository.markFailed(input.documentId, 'ORCHESTRATOR_ERROR', errMsg);
      } catch {
        // Best-effort database status mark
      }

      multimodalTelemetryService.logEvent({
        event: 'multimodal.processing.failed',
        documentId: input.documentId,
        tenantId: input.userId,
        error: errMsg
      });

      return {
        handled: false,
        reason: 'ERROR',
        tablesExtracted: 0,
        imagesFound: 0,
        imagesAnalyzed: 0,
        chartsExtracted: 0,
        ocrPagesProcessed: 0,
        durationMs: Date.now() - startTime
      };
    }
  }

  private async run(
    input: MultimodalProcessInput,
    config: MultimodalConfig,
    startTime: number
  ): Promise<MultimodalDocumentAnalysisResult> {
    const { documentId, userId, parsedDocument } = input;

    await multimodalRepository.upsertRun({
      documentId,
      userId,
      ocrEnabled: config.ocrEnabled,
      tableExtractionEnabled: config.tableExtractionEnabled,
      imageAnalysisEnabled: config.imageAnalysisEnabled,
      chartExtractionEnabled: config.chartAnalysisEnabled
    });

    let ocrPagesProcessed = 0;
    let tablesExtracted = 0;
    let imagesAnalyzed = 0;
    let chartsExtracted = 0;

    const allNewChunks: MultimodalChunkBuildOutput[] = [];

    // 1. Scanned Document Detection & OCR
    if (config.ocrEnabled) {
      await multimodalRepository.markStage(documentId, 'OCR');
      const scanResult = scannedDocumentDetector.detect(parsedDocument.pages);

      if (scanResult.isScanned) {
        for (const scannedPageNum of scanResult.scannedPageNumbers) {
          await ocrService.performOCR({ pageNumber: scannedPageNum });
          ocrPagesProcessed++;
        }
      }
    }

    // 2. Table Extraction
    if (config.tableExtractionEnabled) {
      await multimodalRepository.markStage(documentId, 'TABLE_EXTRACTION');
      const extractedTables: ExtractedTableDTO[] = [];

      for (const page of parsedDocument.pages) {
        if (extractedTables.length >= config.maxTablesPerDocument) break;
        const tables = tableExtractionService.extractFromText(page.text, page.pageNumber);
        extractedTables.push(...tables);
      }

      const cappedTables = extractedTables.slice(0, config.maxTablesPerDocument);
      if (cappedTables.length > 0) {
        await multimodalRepository.saveExtractedTables(documentId, cappedTables);
        const tableChunks = multimodalChunkBuilderService.buildTableChunks(cappedTables);
        allNewChunks.push(...tableChunks);
        tablesExtracted = cappedTables.length;
      }
    }

    // 3. Image Analysis
    if (config.imageAnalysisEnabled) {
      await multimodalRepository.markStage(documentId, 'IMAGE_ANALYSIS');
      const sampleImages: ExtractedImageDTO[] = [];

      for (const page of parsedDocument.pages) {
        if (sampleImages.length >= config.maxImagesPerDocument) break;
        if (/\b(image|figure|photo|diagram|illustration)\b/i.test(page.text)) {
          const img: ExtractedImageDTO = {
            pageNumber: page.pageNumber,
            imageIndex: sampleImages.length,
            mimeType: 'image/png',
            ocrText: page.text.slice(0, 300)
          };
          const analyzed = await imageAnalysisService.analyzeImage(img);
          sampleImages.push(analyzed);
        }
      }

      const cappedImages = sampleImages.slice(0, config.maxImagesPerDocument);
      if (cappedImages.length > 0) {
        await multimodalRepository.saveExtractedImages(documentId, cappedImages);
        const imageChunks = multimodalChunkBuilderService.buildImageChunks(cappedImages);
        allNewChunks.push(...imageChunks);
        imagesAnalyzed = cappedImages.length;
      }
    }

    // 4. Chart & Diagram Extraction
    if (config.chartAnalysisEnabled) {
      await multimodalRepository.markStage(documentId, 'CHART_EXTRACTION');
      const extractedCharts: ExtractedChartDTO[] = [];

      for (const page of parsedDocument.pages) {
        if (extractedCharts.length >= config.maxChartsPerDocument) break;
        const charts = chartAnalysisService.detectAndAnalyzeChart(page.text, page.pageNumber);
        extractedCharts.push(...charts);
      }

      const cappedCharts = extractedCharts.slice(0, config.maxChartsPerDocument);
      if (cappedCharts.length > 0) {
        await multimodalRepository.saveExtractedCharts(documentId, cappedCharts);
        const chartChunks = multimodalChunkBuilderService.buildChartChunks(cappedCharts);
        allNewChunks.push(...chartChunks);
        chartsExtracted = cappedCharts.length;
      }
    }

    // 5. Replace Multimodal Intelligence Chunks Idempotently
    if (allNewChunks.length > 0) {
      await multimodalRepository.replaceMultimodalChunks(documentId, allNewChunks);
    }

    // 6. Mark Processing Completed in Database
    await multimodalRepository.markCompleted(documentId, {
      tablesExtracted,
      imagesFound: imagesAnalyzed,
      imagesAnalyzed,
      chartsExtracted
    });

    const durationMs = Date.now() - startTime;

    multimodalTelemetryService.logEvent({
      event: 'multimodal.processing.completed',
      documentId,
      tenantId: userId,
      tablesExtracted,
      imagesAnalyzed,
      chartsExtracted,
      ocrPagesProcessed,
      durationMs
    });

    return {
      handled: true,
      tablesExtracted,
      imagesFound: imagesAnalyzed,
      imagesAnalyzed,
      chartsExtracted,
      ocrPagesProcessed,
      durationMs
    };
  }
}

export const multimodalOrchestratorService = new MultimodalOrchestratorService();
