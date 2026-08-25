import { getMultimodalConfig, MultimodalConfig } from './multimodal.config';
import { multimodalExtractionRepository } from './multimodal-extraction.repository';
import { tableProviderRegistry } from './table/table-provider.registry';
import type { ParsedDocumentLike } from '@/features/document-intelligence/document-intelligence.types';
import type { ExtractedTableDTO } from './multimodal.types';

export interface MultimodalExtractionInput {
  documentId: string;
  userId: string;
  parsedDocument: ParsedDocumentLike;
}

export interface MultimodalExtractionResult {
  handled: boolean;
  reason?: string;
  tablesExtracted?: number;
  imagesFound?: number;
  chartsFound?: number;
}

/**
 * The single entry point the worker calls for the async multimodal extraction job (Phase 69C).
 * Runs as a non-blocking follow-up AFTER the document reaches COMPLETED — never inline in the
 * critical ingestion path. Never throws — any internal failure is converted into
 * `{ handled: false, reason }`, matching the exact contract established by
 * document-intelligence-orchestrator.service.ts (69A).
 */
export class MultimodalExtractionOrchestratorService {
  public async process(input: MultimodalExtractionInput): Promise<MultimodalExtractionResult> {
    const config = getMultimodalConfig();
    if (!config.enabled) {
      return { handled: false, reason: 'DISABLED' };
    }

    try {
      return await this.run(input, config);
    } catch (err) {
      console.warn(
        `[MultimodalExtractionOrchestratorService] Pipeline failed unexpectedly for document ${input.documentId}:`,
        err
      );
      try {
        await multimodalExtractionRepository.markFailed(
          input.documentId,
          'ORCHESTRATOR_ERROR',
          err instanceof Error ? err.message : String(err)
        );
      } catch {
        // Best-effort status write only.
      }
      return { handled: false, reason: 'ERROR' };
    }
  }

  private async run(input: MultimodalExtractionInput, config: MultimodalConfig): Promise<MultimodalExtractionResult> {
    const { documentId, userId, parsedDocument } = input;

    await multimodalExtractionRepository.upsertRun({
      documentId,
      userId,
      ocrEnabled: config.ocrEnabled,
      tableExtractionEnabled: config.tableExtractionEnabled,
      imageAnalysisEnabled: config.imageAnalysisEnabled,
      chartExtractionEnabled: config.chartExtractionEnabled
    });

    let tablesExtracted = 0;

    if (config.tableExtractionEnabled) {
      await multimodalExtractionRepository.markStage(documentId, 'TABLE_EXTRACTION');
      const provider = tableProviderRegistry.get(config.tableProvider);
      const allTables: ExtractedTableDTO[] = [];

      for (const page of parsedDocument.pages) {
        if (allTables.length >= config.maxTablesPerDocument) break;
        const tables = await provider.extractFromText(page.text, page.pageNumber);
        allTables.push(...tables);
      }

      const capped = allTables.slice(0, config.maxTablesPerDocument);
      await multimodalExtractionRepository.saveExtractedTables(documentId, capped);

      const newChunks = capped.map((t) => ({
        pageNumber: t.pageNumber,
        content: t.markdownRepresentation,
        tokenCount: Math.ceil(t.markdownRepresentation.length / 4),
        metadata: { contentType: 'TABLE', chunkingStrategy: 'multimodal_table', source: 'pdf', tableIndex: t.tableIndex }
      }));
      await multimodalExtractionRepository.replaceTableChunks(documentId, newChunks);
      tablesExtracted = capped.length;
    }

    // OCR/image/chart stages: real providers exist (see vision/gemini-vision.provider.ts for a
    // genuinely working implementation), but no PDF page-image producer exists yet in this
    // codebase (PDF-only uploads, text-only extraction). These stages complete cleanly with zero
    // items found rather than erroring — this is an expected, documented gap, not a failure.
    if (config.ocrEnabled) {
      await multimodalExtractionRepository.markStage(documentId, 'OCR');
    }
    if (config.imageAnalysisEnabled) {
      await multimodalExtractionRepository.markStage(documentId, 'IMAGE_ANALYSIS');
    }
    if (config.chartExtractionEnabled) {
      await multimodalExtractionRepository.markStage(documentId, 'CHART_EXTRACTION');
    }

    await multimodalExtractionRepository.markCompleted(
      documentId,
      { tablesExtracted, imagesFound: 0, imagesAnalyzed: 0, chartsExtracted: 0 },
      {
        note:
          'No PDF page-image producer available yet — image/chart analysis has zero input for PDF documents until a rasterization phase ships.'
      }
    );

    return { handled: true, tablesExtracted, imagesFound: 0, chartsFound: 0 };
  }
}

export const multimodalExtractionOrchestratorService = new MultimodalExtractionOrchestratorService();
