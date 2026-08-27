export interface RagTelemetryEvent {
  event:
    | 'rag.request.started'
    | 'rag.authorization.completed'
    | 'rag.scope.completed'
    | 'rag.cache.answer.hit'
    | 'rag.cache.answer.miss'
    | 'rag.cache.retrieval.hit'
    | 'rag.cache.retrieval.miss'
    | 'rag.retrieval.vector.completed'
    | 'rag.retrieval.keyword.completed'
    | 'rag.retrieval.graph.completed'
    | 'rag.reranking.skipped'
    | 'rag.reranking.completed'
    | 'rag.fast_path.used'
    | 'rag.context.completed'
    | 'rag.llm.first_token'
    | 'rag.request.completed'
    | 'rag.request.timeout';
  requestId: string;
  scopeType?: string;
  durationMs?: number;
  remainingBudgetMs?: number;
  cacheHit?: boolean;
  topK?: number;
  metadata?: Record<string, unknown>;
}

export class RagPerformanceTelemetryService {
  /**
   * Logs structured RAG performance telemetry without logging raw document content or secrets.
   */
  public logEvent(payload: RagTelemetryEvent): void {
    if (process.env.NODE_ENV === 'test') return;

    try {
      const sanitizedMetadata = payload.metadata ? this.sanitizeMetadata(payload.metadata) : undefined;
      const logLine = {
        timestamp: new Date().toISOString(),
        ...payload,
        metadata: sanitizedMetadata
      };

      console.log(`[RAGTelemetry] ${payload.event} ${JSON.stringify(logLine)}`);
    } catch (err) {
      console.warn('[RAGTelemetry] Failed to log telemetry:', err);
    }
  }

  private sanitizeMetadata(data: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    const sensitiveKeys = [/content/i, /text/i, /prompt/i, /key/i, /token/i, /secret/i, /password/i];

    for (const [k, v] of Object.entries(data)) {
      if (sensitiveKeys.some((pattern) => pattern.test(k))) {
        sanitized[k] = '[REDACTED]';
      } else {
        sanitized[k] = v;
      }
    }
    return sanitized;
  }
}

export const ragPerformanceTelemetryService = new RagPerformanceTelemetryService();
