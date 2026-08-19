import { env } from '@/config/env';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerStatus {
  providerName: string;
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureMs?: number;
  nextAttemptAllowedMs?: number;
  halfOpenProbes?: number;
}

export class LLMCircuitBreakerService {
  private circuits: Map<
    string,
    {
      state: CircuitState;
      consecutiveFailures: number;
      lastFailureMs: number;
      halfOpenProbes: number;
    }
  > = new Map();

  private getThreshold(): number {
    return env.server?.LLM_CIRCUIT_FAILURE_THRESHOLD ?? 5;
  }

  private getOpenMs(): number {
    return env.server?.LLM_CIRCUIT_OPEN_MS ?? 15000;
  }

  private getMaxProbes(): number {
    return env.server?.LLM_CIRCUIT_HALF_OPEN_MAX_PROBES ?? 2;
  }

  private getOrCreateCircuit(providerName: string) {
    const key = providerName.toLowerCase();
    let circuit = this.circuits.get(key);
    if (!circuit) {
      circuit = {
        state: 'CLOSED',
        consecutiveFailures: 0,
        lastFailureMs: 0,
        halfOpenProbes: 0
      };
      this.circuits.set(key, circuit);
    }
    return circuit;
  }

  public isAvailable(providerName: string): boolean {
    const circuit = this.getOrCreateCircuit(providerName);
    const now = Date.now();
    const openMs = this.getOpenMs();
    const maxProbes = this.getMaxProbes();

    if (circuit.state === 'CLOSED') {
      return true;
    }

    if (circuit.state === 'OPEN') {
      if (now - circuit.lastFailureMs > openMs) {
        circuit.state = 'HALF_OPEN';
        circuit.halfOpenProbes = 1;
        return true;
      }
      return false; // Fast fail when OPEN
    }

    if (circuit.state === 'HALF_OPEN') {
      if (circuit.halfOpenProbes < maxProbes) {
        circuit.halfOpenProbes++;
        return true;
      }
      return false; // Limit concurrent probes during HALF_OPEN
    }

    return true;
  }

  public recordSuccess(providerName: string): void {
    const circuit = this.getOrCreateCircuit(providerName);
    circuit.consecutiveFailures = 0;
    circuit.halfOpenProbes = 0;
    circuit.state = 'CLOSED';
  }

  public recordFailure(providerName: string, err?: any): void {
    if (this.isIgnorableError(err)) {
      return; // Do not count client disconnects, AbortError, or intentional cancellations as provider infrastructure failures
    }

    const circuit = this.getOrCreateCircuit(providerName);
    circuit.consecutiveFailures++;
    circuit.lastFailureMs = Date.now();
    const threshold = this.getThreshold();

    if (circuit.consecutiveFailures >= threshold || circuit.state === 'HALF_OPEN') {
      circuit.state = 'OPEN';
      circuit.halfOpenProbes = 0;
      console.warn(
        `[LLMCircuitBreaker] Provider "${providerName}" circuit OPENED after ${circuit.consecutiveFailures} consecutive failures.`
      );
    }
  }

  public isIgnorableError(err?: any): boolean {
    if (!err) return false;
    const name = err.name || err.constructor?.name || '';
    const message = err.message || String(err);

    if (name === 'AbortError' || name === 'CanceledError') return true;
    if (message.includes('aborted') || message.includes('cancelled') || message.includes('client disconnected')) return true;
    return false;
  }

  public getStatus(providerName: string): CircuitBreakerStatus {
    const circuit = this.getOrCreateCircuit(providerName);
    const openMs = this.getOpenMs();
    return {
      providerName,
      state: circuit.state,
      consecutiveFailures: circuit.consecutiveFailures,
      halfOpenProbes: circuit.halfOpenProbes,
      lastFailureMs: circuit.lastFailureMs || undefined,
      nextAttemptAllowedMs: circuit.state === 'OPEN' ? circuit.lastFailureMs + openMs : undefined
    };
  }
}

export const llmCircuitBreakerService = new LLMCircuitBreakerService();
