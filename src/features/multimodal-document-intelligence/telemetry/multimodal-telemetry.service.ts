export interface MultimodalTelemetryPayload {
  event:
    | 'multimodal.processing.started'
    | 'multimodal.processing.completed'
    | 'multimodal.processing.failed'
    | 'multimodal.ocr.completed'
    | 'multimodal.table.extracted'
    | 'multimodal.image.analyzed'
    | 'multimodal.chart.analyzed';
  documentId: string;
  tenantId: string;
  stage?: string;
  durationMs?: number;
  tablesExtracted?: number;
  imagesAnalyzed?: number;
  chartsExtracted?: number;
  ocrPagesProcessed?: number;
  error?: string;
}

export class MultimodalTelemetryService {
  public logEvent(payload: MultimodalTelemetryPayload): void {
    if (process.env.NODE_ENV === 'test') return;

    try {
      const logLine = {
        timestamp: new Date().toISOString(),
        ...payload
      };
      console.log(`[MultimodalTelemetry] ${payload.event} ${JSON.stringify(logLine)}`);
    } catch (err) {
      console.warn('[MultimodalTelemetry] Failed to log telemetry:', err);
    }
  }
}

export const multimodalTelemetryService = new MultimodalTelemetryService();
