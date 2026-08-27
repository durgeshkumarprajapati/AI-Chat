import { ExtractedChartDTO, ExtractedImageDTO, ExtractedTableDTO, MultimodalContentType } from '../multimodal.types';
import { multimodalContentSanitizer } from '../security/multimodal-content-sanitizer';

export interface MultimodalChunkBuildOutput {
  pageNumber: number;
  content: string;
  tokenCount: number;
  metadata: {
    contentType: MultimodalContentType;
    pageNumber: number;
    extractionConfidence: number;
    sourceReference: string;
    isUntrustedEvidence: true;
    chunkingStrategy: 'multimodal_intelligence';
    tableIndex?: number;
    imageIndex?: number;
    chartIndex?: number;
  };
}

export class MultimodalChunkBuilderService {
  public buildTableChunks(tables: ExtractedTableDTO[]): MultimodalChunkBuildOutput[] {
    return tables.map((t) => {
      const sourceRef = `Table ${t.tableIndex + 1} — Page ${t.pageNumber}`;
      const rawText = t.markdownRepresentation || JSON.stringify(t.structuredJson || {});
      const sanitized = multimodalContentSanitizer.sanitize(rawText, 'TABLE', sourceRef);

      return {
        pageNumber: t.pageNumber,
        content: sanitized,
        tokenCount: Math.ceil(sanitized.length / 4),
        metadata: {
          contentType: 'TABLE',
          pageNumber: t.pageNumber,
          extractionConfidence: t.extractionConfidence ?? 0.95,
          sourceReference: sourceRef,
          isUntrustedEvidence: true,
          chunkingStrategy: 'multimodal_intelligence',
          tableIndex: t.tableIndex
        }
      };
    });
  }

  public buildImageChunks(images: ExtractedImageDTO[]): MultimodalChunkBuildOutput[] {
    return images.map((img) => {
      const sourceRef = `Image ${img.imageIndex + 1} — Page ${img.pageNumber}`;
      const rawText = `Visual Description: ${img.visionDescription || ''}\nOCR Text: ${img.ocrText || ''}`;
      const sanitized = multimodalContentSanitizer.sanitize(rawText, 'IMAGE', sourceRef);

      return {
        pageNumber: img.pageNumber,
        content: sanitized,
        tokenCount: Math.ceil(sanitized.length / 4),
        metadata: {
          contentType: 'IMAGE',
          pageNumber: img.pageNumber,
          extractionConfidence: img.visionConfidence ?? 0.85,
          sourceReference: sourceRef,
          isUntrustedEvidence: true,
          chunkingStrategy: 'multimodal_intelligence',
          imageIndex: img.imageIndex
        }
      };
    });
  }

  public buildChartChunks(charts: ExtractedChartDTO[]): MultimodalChunkBuildOutput[] {
    return charts.map((ch) => {
      const sourceRef = `${ch.chartType || 'Chart'} ${ch.chartIndex + 1} — Page ${ch.pageNumber}`;
      const dataStr = ch.extractedDataPoints ? JSON.stringify(ch.extractedDataPoints) : '';
      const rawText = `Chart Type: ${ch.chartType || 'Visualization'}\nDescription: ${ch.description || ''}\nExtracted Data: ${dataStr}`;
      const sanitized = multimodalContentSanitizer.sanitize(rawText, ch.chartType === 'architecture' || ch.chartType === 'flow' ? 'DIAGRAM' : 'CHART', sourceRef);

      return {
        pageNumber: ch.pageNumber,
        content: sanitized,
        tokenCount: Math.ceil(sanitized.length / 4),
        metadata: {
          contentType: ch.chartType === 'architecture' || ch.chartType === 'flow' ? 'DIAGRAM' : 'CHART',
          pageNumber: ch.pageNumber,
          extractionConfidence: ch.confidence ?? 0.85,
          sourceReference: sourceRef,
          isUntrustedEvidence: true,
          chunkingStrategy: 'multimodal_intelligence',
          chartIndex: ch.chartIndex
        }
      };
    });
  }
}

export const multimodalChunkBuilderService = new MultimodalChunkBuilderService();
