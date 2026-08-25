import { getDocumentIntelligenceConfig, DocumentIntelligenceConfig } from './document-intelligence.config';
import { documentIntelligenceRepository } from './document-intelligence.repository';
import { layoutAnalyzerService } from './layout/layout-analyzer.service';
import { semanticChunkerService } from './chunking/semantic-chunker.service';
import { metadataExtractorService } from './metadata-extraction/metadata-extractor.service';
import { classifierService } from './classification/classifier.service';
import { logStageCompleted, logStageFailed, logRunOutcome } from './telemetry/document-intelligence-telemetry';
import {
  ClassificationResultDTO,
  DocumentIntelligenceInput,
  DocumentIntelligenceRunResult,
  ExtractedDocumentMetadataDTO,
  LayoutBlock,
  SemanticChunk
} from './document-intelligence.types';

// Cap on combined page text passed into the metadata/classification LLM stages, independent of
// each prompt's own per-call truncation — keeps very large documents from ballooning this stage's
// own memory/string-concat cost before the prompt builder even runs.
const DOCUMENT_TEXT_JOIN_LIMIT = 20000;

/**
 * The single entry point the worker calls. Never throws — every internal failure (a stage
 * erroring, a timeout, the feature being disabled) is converted into a `{ handled: false }`
 * result so the worker's existing chunking/error-classification logic is never touched by this
 * feature. Callers MUST fall back to the legacy chunker whenever `handled` is false.
 */
export class DocumentIntelligenceOrchestratorService {
  public async process(input: DocumentIntelligenceInput): Promise<DocumentIntelligenceRunResult> {
    const config = getDocumentIntelligenceConfig();

    if (!config.enabled) {
      return { handled: false, reason: 'DISABLED' };
    }

    try {
      return await this.withTimeout(this.runPipeline(input, config), config.timeoutMs);
    } catch (err) {
      console.warn(
        `[DocumentIntelligenceOrchestratorService] Pipeline failed unexpectedly for document ${input.documentId}:`,
        err
      );
      try {
        await documentIntelligenceRepository.markFailed(
          input.documentId,
          'ORCHESTRATOR_ERROR',
          err instanceof Error ? err.message : String(err)
        );
      } catch {
        // Best-effort status write only — a secondary DB failure here must never escape.
      }
      return { handled: false, reason: 'ERROR' };
    }
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Document intelligence pipeline timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
  }

  private async runPipeline(
    input: DocumentIntelligenceInput,
    config: DocumentIntelligenceConfig
  ): Promise<DocumentIntelligenceRunResult> {
    const startedAt = Date.now();
    const { documentId, userId, parsedDocument } = input;

    // Semantic chunking is the stage that actually produces chunks for the worker to persist —
    // without it there's nothing for this pipeline to hand back, regardless of whether metadata
    // extraction/classification are independently enabled.
    if (!config.semanticChunkingEnabled) {
      await documentIntelligenceRepository.upsertRun({
        documentId,
        userId,
        layoutAnalysisEnabled: config.layoutAnalysisEnabled,
        semanticChunkingEnabled: false,
        metadataExtractionEnabled: config.metadataExtractionEnabled,
        classificationEnabled: config.classificationEnabled
      });
      await documentIntelligenceRepository.markSkipped(documentId, 'SEMANTIC_CHUNKING_DISABLED');
      logRunOutcome(documentId, 'skipped', Date.now() - startedAt);
      return { handled: false, reason: 'SEMANTIC_CHUNKING_DISABLED' };
    }

    await documentIntelligenceRepository.upsertRun({
      documentId,
      userId,
      layoutAnalysisEnabled: config.layoutAnalysisEnabled,
      semanticChunkingEnabled: config.semanticChunkingEnabled,
      metadataExtractionEnabled: config.metadataExtractionEnabled,
      classificationEnabled: config.classificationEnabled
    });

    const fullText = parsedDocument.pages
      .map((p) => p.text)
      .join('\n\n')
      .slice(0, DOCUMENT_TEXT_JOIN_LIMIT);

    // Stage 1: Layout analysis (optional)
    let layoutBlocks: LayoutBlock[] | undefined;
    if (config.layoutAnalysisEnabled) {
      const stageStart = Date.now();
      try {
        await documentIntelligenceRepository.markStage(documentId, 'LAYOUT_ANALYSIS');
        layoutBlocks = layoutAnalyzerService.analyze(parsedDocument);
        logStageCompleted(documentId, 'LAYOUT_ANALYSIS', Date.now() - stageStart);
      } catch (err) {
        logStageFailed(documentId, 'LAYOUT_ANALYSIS', Date.now() - stageStart, err);
        layoutBlocks = undefined; // semantic chunker falls back to raw-page-text blocks
      }
    }

    // Stage 2: Semantic chunking (required for `handled: true`)
    let chunks: SemanticChunk[];
    {
      const stageStart = Date.now();
      try {
        await documentIntelligenceRepository.markStage(documentId, 'SEMANTIC_CHUNKING');
        chunks = semanticChunkerService.chunk(
          parsedDocument,
          { maxTokens: config.semanticChunkMaxTokens, overlapTokens: config.semanticChunkOverlapTokens },
          layoutBlocks
        );
        logStageCompleted(documentId, 'SEMANTIC_CHUNKING', Date.now() - stageStart);
      } catch (err) {
        logStageFailed(documentId, 'SEMANTIC_CHUNKING', Date.now() - stageStart, err);
        await documentIntelligenceRepository.markFailed(
          documentId,
          'SEMANTIC_CHUNKING_ERROR',
          err instanceof Error ? err.message : String(err)
        );
        logRunOutcome(documentId, 'fallback', Date.now() - startedAt);
        return { handled: false, reason: 'SEMANTIC_CHUNKING_ERROR' };
      }
    }

    if (chunks.length === 0) {
      await documentIntelligenceRepository.markSkipped(documentId, 'NO_CHUNKS_PRODUCED');
      logRunOutcome(documentId, 'fallback', Date.now() - startedAt);
      return { handled: false, reason: 'NO_CHUNKS_PRODUCED' };
    }

    // Stage 3: Metadata extraction (optional, never blocks the chunking result)
    let extractedMetadata: ExtractedDocumentMetadataDTO | undefined;
    if (config.metadataExtractionEnabled) {
      const stageStart = Date.now();
      try {
        await documentIntelligenceRepository.markStage(documentId, 'METADATA_EXTRACTION');
        extractedMetadata = await metadataExtractorService.extractMetadata(fullText, userId);
        logStageCompleted(documentId, 'METADATA_EXTRACTION', Date.now() - stageStart);
      } catch (err) {
        logStageFailed(documentId, 'METADATA_EXTRACTION', Date.now() - stageStart, err);
      }
    }

    // Stage 4: Classification (optional, never blocks the chunking result)
    let classification: ClassificationResultDTO | undefined;
    if (config.classificationEnabled) {
      const stageStart = Date.now();
      try {
        await documentIntelligenceRepository.markStage(documentId, 'CLASSIFICATION');
        classification = await classifierService.classify(fullText, userId);
        logStageCompleted(documentId, 'CLASSIFICATION', Date.now() - stageStart);
      } catch (err) {
        logStageFailed(documentId, 'CLASSIFICATION', Date.now() - stageStart, err);
      }
    }

    await documentIntelligenceRepository.markCompleted(documentId, {
      chunkingStrategy: 'semantic',
      legacyFallbackUsed: false,
      documentType: classification?.documentType,
      classificationConfidence: classification?.confidence,
      extractedMetadata
    });

    logRunOutcome(documentId, 'completed', Date.now() - startedAt);

    return {
      handled: true,
      chunks,
      documentType: classification?.documentType,
      classificationConfidence: classification?.confidence,
      extractedMetadata
    };
  }
}

export const documentIntelligenceOrchestratorService = new DocumentIntelligenceOrchestratorService();
