export interface LLMTelemetryEvent {
  requestId: string;
  userIdHash?: string;
  provider: string;
  model: string;
  feature?: string;
  complexity: 'LOW' | 'MEDIUM' | 'HIGH';
  cached: boolean;
  firstTokenMs?: number;
  totalMs: number;
  success: boolean;
  error?: string;
  timestamp: string;
}

export class LLMTelemetryService {
  private events: LLMTelemetryEvent[] = [];
  private readonly maxEvents = 1000;

  public recordEvent(event: Omit<LLMTelemetryEvent, 'timestamp'>): void {
    const entry: LLMTelemetryEvent = {
      ...event,
      timestamp: new Date().toISOString()
    };

    this.events.push(entry);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    if (process.env.NODE_ENV !== 'test') {
      console.log(`[LLMTelemetry] provider=${entry.provider} model=${entry.model} complexity=${entry.complexity} cached=${entry.cached} totalMs=${entry.totalMs}ms success=${entry.success}`);
    }
  }

  public getDiagnostics() {
    const totalRequests = this.events.length;
    if (totalRequests === 0) {
      return {
        totalRequests: 0,
        cacheHitRatePercent: 0,
        avgLatencyMs: 0,
        p50Ms: 0,
        p95Ms: 0,
        p99Ms: 0,
        avgFirstTokenMs: 0,
        providerDistribution: {},
        errorRatePercent: 0
      };
    }

    const cacheHits = this.events.filter((e) => e.cached).length;
    const errors = this.events.filter((e) => !e.success).length;

    const latencies = this.events.map((e) => e.totalMs).sort((a, b) => a - b);
    const sumLatency = latencies.reduce((a, b) => a + b, 0);

    const firstTokenLatencies = this.events.map((e) => e.firstTokenMs).filter((t): t is number => typeof t === 'number');
    const sumFirstToken = firstTokenLatencies.reduce((a, b) => a + b, 0);

    const providerCounts: Record<string, number> = {};
    for (const e of this.events) {
      providerCounts[e.provider] = (providerCounts[e.provider] || 0) + 1;
    }

    const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
    const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

    return {
      totalRequests,
      cacheHitRatePercent: Number(((cacheHits / totalRequests) * 100).toFixed(1)),
      avgLatencyMs: Number((sumLatency / totalRequests).toFixed(1)),
      p50Ms: p50,
      p95Ms: p95,
      p99Ms: p99,
      avgFirstTokenMs: firstTokenLatencies.length > 0 ? Number((sumFirstToken / firstTokenLatencies.length).toFixed(1)) : 0,
      providerDistribution: providerCounts,
      errorRatePercent: Number(((errors / totalRequests) * 100).toFixed(1))
    };
  }

  public clearEvents(): void {
    this.events = [];
  }
}

export const llmTelemetryService = new LLMTelemetryService();
