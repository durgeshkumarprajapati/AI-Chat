import {
  LLMCapability,
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  StructuredLLMRequest,
  ProviderHealthStatus
} from '../src/features/llm/llm.types';
import { LLMProvider } from '../src/features/llm/llm-provider.interface';
import { OllamaProvider } from '../src/features/llm/providers/ollama.provider';
import { KimiProvider } from '../src/features/llm/providers/kimi.provider';
import { LLMComplexityClassifier } from '../src/features/llm/llm-complexity-classifier';
import { LLMPolicyService } from '../src/features/llm/llm-policy.service';
import { LLMCircuitBreakerService } from '../src/features/llm/llm-circuit-breaker.service';
import { LLMModelRegistry } from '../src/features/llm/llm-model-registry';
import { LLMRouterService } from '../src/features/llm/llm-router.service';
import { LLMCacheService } from '../src/features/llm/llm-cache.service';
import { LLMFallbackService } from '../src/features/llm/llm-fallback.service';
import { TokenBudgetManager } from '../src/features/llm/utils/token-budget';
import { LLMTelemetryService } from '../src/features/llm/llm-telemetry.service';
import { LLMGateway } from '../src/features/llm/llm-gateway.service';

class MockTestFastProvider implements LLMProvider {
  public readonly name = 'ollama';
  public shouldFail = false;

  public async generate(req: LLMRequest): Promise<LLMResponse> {
    if (this.shouldFail) throw new Error('Ollama provider temporary failure');
    return {
      text: `Ollama fast answer for: ${req.prompt}`,
      provider: 'ollama',
      model: 'llama3.2',
      complexity: 'LOW',
      cached: false,
      totalMs: 12
    };
  }

  public async *stream(_req: LLMRequest): AsyncIterable<LLMStreamChunk> {
    if (this.shouldFail) throw new Error('Ollama stream failure');
    yield { text: 'Hello', isFirstToken: true, done: false, provider: 'ollama', model: 'llama3.2' };
    yield { text: ' World', isFirstToken: false, done: true, provider: 'ollama', model: 'llama3.2' };
  }

  public async generateStructured<T>(req: StructuredLLMRequest<T>): Promise<T> {
    const raw = '{"success": true, "message": "Ollama JSON"}';
    return req.parseResult ? req.parseResult(raw) : JSON.parse(raw);
  }

  public async healthCheck(): Promise<ProviderHealthStatus> {
    return { name: this.name, status: 'healthy', latencyMs: 5 };
  }

  public supports(cap: LLMCapability): boolean {
    return cap !== LLMCapability.REASONING;
  }
}

class MockTestReasoningProvider implements LLMProvider {
  public readonly name = 'kimi';
  public shouldFail = false;

  public async generate(req: LLMRequest): Promise<LLMResponse> {
    if (this.shouldFail) throw new Error('Kimi provider connection timeout');
    return {
      text: `Kimi high reasoning answer for: ${req.prompt}`,
      provider: 'kimi',
      model: 'kimi-k3',
      complexity: 'HIGH',
      cached: false,
      totalMs: 40
    };
  }

  public async *stream(_req: LLMRequest): AsyncIterable<LLMStreamChunk> {
    if (this.shouldFail) throw new Error('Kimi stream failure');
    yield { text: 'Reasoning step 1', isFirstToken: true, done: false, provider: 'kimi', model: 'kimi-k3' };
    yield { text: ' Conclusion', isFirstToken: false, done: true, provider: 'kimi', model: 'kimi-k3' };
  }

  public async generateStructured<T>(req: StructuredLLMRequest<T>): Promise<T> {
    const raw = '{"success": true, "reasoning": "Kimi JSON"}';
    return req.parseResult ? req.parseResult(raw) : JSON.parse(raw);
  }

  public async healthCheck(): Promise<ProviderHealthStatus> {
    return { name: this.name, status: 'healthy', latencyMs: 15 };
  }

  public supports(): boolean {
    return true;
  }
}

async function runPhase39Tests() {
  console.log('====================================================');
  console.log('🚀 RUNNING PHASE 39 LLM GATEWAY TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, description: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`  ✓ [TEST ${total}] ${description}`);
    } else {
      console.error(`  ❌ [TEST ${total}] FAILED: ${description}`);
      throw new Error(`Test assertion failed: ${description}`);
    }
  }

  // TEST 1: Unified LLMProvider interface conformity
  const ollama = new OllamaProvider();
  const kimi = new KimiProvider();
  assert(ollama.name === 'ollama' && ollama.supports(LLMCapability.TEXT_GENERATION), 'OllamaProvider conforms to LLMProvider interface');
  assert(kimi.name === 'kimi' && kimi.supports(LLMCapability.REASONING), 'KimiProvider conforms to LLMProvider interface');

  // TEST 2: Deterministic complexity classification
  const classifier = new LLMComplexityClassifier();
  const lowComp = classifier.classify({ prompt: 'What is document AI?', feature: 'RAG_CHAT' });
  const highComp = classifier.classify({ prompt: 'Analyze and compare multi-step workflows', feature: 'AGENTIC_RESEARCH' });
  assert(lowComp === 'LOW', 'Simple prompt classified as LOW complexity');
  assert(highComp === 'HIGH', 'Agentic research prompt classified as HIGH complexity');

  // TEST 3: Model Registry registration and capabilities lookup
  const registry = new LLMModelRegistry();
  const mockFast = new MockTestFastProvider();
  const mockKimi = new MockTestReasoningProvider();
  registry.registerProvider({ provider: mockFast, defaultModel: 'llama3.2', priority: 1 });
  registry.registerProvider({ provider: mockKimi, defaultModel: 'kimi-k3', priority: 2 });
  assert(registry.getProvider('ollama') !== null, 'Registry returns registered Ollama provider');
  assert(registry.getProvider('kimi') !== null, 'Registry returns registered Kimi provider');

  // TEST 4: Routing Policy decision making
  const policy = new LLMPolicyService();
  const routeLow = policy.selectRoute({ prompt: 'Simple query', feature: 'RAG_CHAT' }, 'LOW');
  assert(routeLow.providerName === 'ollama', 'LOW complexity query routes to fast Ollama provider');

  // TEST 5: Local-Only constraint enforcement
  const routeLocal = policy.selectRoute({ prompt: 'Confidential request', localOnly: true, feature: 'AGENTIC_RESEARCH' }, 'HIGH');
  assert(routeLocal.providerName === 'ollama' && routeLocal.reason.includes('LOCAL_ONLY'), 'Local-only constraint forces Ollama provider');

  // TEST 6: Provider Circuit Breaker state management
  const circuitBreaker = new LLMCircuitBreakerService();
  assert(circuitBreaker.isAvailable('kimi') === true, 'New circuit starts in CLOSED state');
  circuitBreaker.recordFailure('kimi');
  circuitBreaker.recordFailure('kimi');
  circuitBreaker.recordFailure('kimi');
  assert(circuitBreaker.isAvailable('kimi') === false, 'Circuit transitions to OPEN after 3 consecutive failures');
  circuitBreaker.recordSuccess('kimi');
  assert(circuitBreaker.isAvailable('kimi') === true, 'Circuit resets to CLOSED after success');

  // TEST 7: Fallback execution when primary fails
  const fallbackService = new LLMFallbackService(registry);
  mockKimi.shouldFail = true;
  mockFast.shouldFail = false;
  const fallbackRes = await fallbackService.executeWithFallback(mockKimi, { prompt: 'Complex query' });
  assert(fallbackRes.usedFallback === true && fallbackRes.response.provider === 'ollama', 'Kimi failure gracefully falls back to Ollama');
  mockKimi.shouldFail = false;

  // TEST 8: Response Caching & Tenant Isolation
  const cache = new LLMCacheService();
  const hashUserA = cache.computeRequestHash({ prompt: 'Document summary', userId: 'user-A' }, 'ollama', 'llama3.2');
  const hashUserB = cache.computeRequestHash({ prompt: 'Document summary', userId: 'user-B' }, 'ollama', 'llama3.2');
  assert(hashUserA !== hashUserB, 'User A request hash is strictly isolated from User B request hash');

  await cache.setCachedResponse({ prompt: 'Document summary', userId: 'user-A' }, 'ollama', 'llama3.2', {
    text: 'Private summary for User A',
    provider: 'ollama',
    model: 'llama3.2',
    complexity: 'LOW',
    cached: true,
    totalMs: 5
  });

  const cacheHitA = await cache.getCachedResponse({ prompt: 'Document summary', userId: 'user-A' }, 'ollama', 'llama3.2');
  const cacheHitB = await cache.getCachedResponse({ prompt: 'Document summary', userId: 'user-B' }, 'ollama', 'llama3.2');
  assert(cacheHitA !== null && cacheHitA.text.includes('User A'), 'User A retrieves cached response');
  assert(cacheHitB === null, 'User B cache lookup yields null (no cross-tenant leakage)');

  // TEST 9: Token Budget Manager context truncation
  const tokenBudget = new TokenBudgetManager();
  const longText = 'Word '.repeat(2000);
  const truncated = tokenBudget.truncateToTokenBudget(longText, 100);
  assert(tokenBudget.estimateTokens(truncated) <= 120, 'Token budget manager truncates long contexts');

  // TEST 10: Streaming time-to-first-token & chunk emission
  const router = new LLMRouterService(classifier, policy, registry);
  const telemetry = new LLMTelemetryService();
  const gateway = new LLMGateway(router, cache, fallbackService, tokenBudget, telemetry, registry);

  const chunks: LLMStreamChunk[] = [];
  for await (const chunk of gateway.stream({ prompt: 'Stream test query', feature: 'RAG_CHAT' })) {
    chunks.push(chunk);
  }
  assert(chunks.length >= 2, 'Streaming emits multiple tokens');
  assert(chunks[0] !== undefined && chunks[0].isFirstToken === true, 'Streaming marks initial token chunk with isFirstToken flag');

  // TEST 11: Structured Output JSON generation
  const structuredData = await gateway.generateStructured<{ success: boolean; message: string }>({
    prompt: 'Generate JSON status',
    feature: 'WORKFLOW_GENERATION'
  });
  assert(structuredData.success === true, 'Gateway generates structured JSON payload');

  // TEST 12: Gateway Health Check reporting
  const health = await gateway.healthCheck();
  assert(health.status === 'healthy' && health.providers['ollama']?.status === 'healthy', 'Gateway health check returns provider status');

  // TEST 13: Structured Telemetry diagnostics logging
  const diagnostics = telemetry.getDiagnostics();
  assert(diagnostics.totalRequests > 0, 'Telemetry records LLM gateway request events');

  console.log('\n====================================================');
  console.log(`🎉 ALL ${passed} / ${total} PHASE 39 TESTS PASSED CLEANLY!`);
  console.log('====================================================\n');
}

runPhase39Tests().catch((err) => {
  console.error('❌ PHASE 39 TEST SUITE FAILED:', err);
  process.exit(1);
});
