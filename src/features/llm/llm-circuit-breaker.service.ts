export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerStatus {
  providerName: string;
  state: CircuitState;
  consecutiveFailures: number;
  lastFailureMs?: number;
  nextAttemptAllowedMs?: number;
}

export class LLMCircuitBreakerService {
  private circuits: Map<
    string,
    {
      state: CircuitState;
      consecutiveFailures: number;
      lastFailureMs: number;
      threshold: number;
      resetTimeoutMs: number;
    }
  > = new Map();

  private readonly defaultThreshold = 3;
  private readonly defaultResetTimeoutMs = 15000;

  private getOrCreateCircuit(providerName: string) {
    const key = providerName.toLowerCase();
    let circuit = this.circuits.get(key);
    if (!circuit) {
      circuit = {
        state: 'CLOSED',
        consecutiveFailures: 0,
        lastFailureMs: 0,
        threshold: this.defaultThreshold,
        resetTimeoutMs: this.defaultResetTimeoutMs
      };
      this.circuits.set(key, circuit);
    }
    return circuit;
  }

  public isAvailable(providerName: string): boolean {
    const circuit = this.getOrCreateCircuit(providerName);
    const now = Date.now();

    if (circuit.state === 'CLOSED') {
      return true;
    }

    if (circuit.state === 'OPEN') {
      if (now - circuit.lastFailureMs > circuit.resetTimeoutMs) {
        circuit.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }

    // HALF_OPEN allows single test execution
    return true;
  }

  public recordSuccess(providerName: string): void {
    const circuit = this.getOrCreateCircuit(providerName);
    circuit.consecutiveFailures = 0;
    circuit.state = 'CLOSED';
  }

  public recordFailure(providerName: string): void {
    const circuit = this.getOrCreateCircuit(providerName);
    circuit.consecutiveFailures++;
    circuit.lastFailureMs = Date.now();

    if (circuit.consecutiveFailures >= circuit.threshold) {
      circuit.state = 'OPEN';
      console.warn(`[LLMCircuitBreaker] Provider "${providerName}" circuit OPENED after ${circuit.consecutiveFailures} consecutive failures.`);
    }
  }

  public getStatus(providerName: string): CircuitBreakerStatus {
    const circuit = this.getOrCreateCircuit(providerName);
    return {
      providerName,
      state: circuit.state,
      consecutiveFailures: circuit.consecutiveFailures,
      lastFailureMs: circuit.lastFailureMs || undefined,
      nextAttemptAllowedMs: circuit.state === 'OPEN' ? circuit.lastFailureMs + circuit.resetTimeoutMs : undefined
    };
  }
}

export const llmCircuitBreakerService = new LLMCircuitBreakerService();
