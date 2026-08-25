// Structured log helpers matching the worker's existing `[Worker] ...` log style. No new metrics
// backend is introduced in this phase — this just keeps stage timing/outcome logging consistent
// so it's easy to wire into real telemetry later without touching call sites.
export function logStageCompleted(documentId: string, stage: string, durationMs: number): void {
  console.log(`[DocumentIntelligence] documentId=${documentId} stage=${stage} status=completed durationMs=${durationMs}`);
}

export function logStageFailed(documentId: string, stage: string, durationMs: number, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[DocumentIntelligence] documentId=${documentId} stage=${stage} status=failed durationMs=${durationMs} error=${message}`);
}

export function logRunOutcome(documentId: string, outcome: 'completed' | 'skipped' | 'failed' | 'fallback', durationMs: number): void {
  console.log(`[DocumentIntelligence] documentId=${documentId} outcome=${outcome} durationMs=${durationMs}`);
}
