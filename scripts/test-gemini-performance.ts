import { llmPolicyService } from '../src/features/llm/llm-policy.service';
import { llmComplexityClassifier } from '../src/features/llm/llm-complexity-classifier';
import { llmRateLimiterService } from '../src/features/llm/llm-rate-limiter.service';
import { llmCircuitBreakerService } from '../src/features/llm/llm-circuit-breaker.service';
import { tokenBudgetManager } from '../src/features/llm/utils/token-budget';

function measureMs(fn: () => void, iterations = 100): { avgMs: number; p50Ms: number; p95Ms: number; p99Ms: number } {
  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const sum = times.reduce((acc, t) => acc + t, 0);
  return {
    avgMs: sum / iterations,
    p50Ms: times[Math.floor(iterations * 0.5)] ?? 0,
    p95Ms: times[Math.floor(iterations * 0.95)] ?? 0,
    p99Ms: times[Math.floor(iterations * 0.99)] ?? 0
  };
}

async function runGeminiPerformanceBenchmark() {
  console.log('====================================================');
  console.log('⚡ PHASE 42 — MULTI-PROVIDER LLM GATEWAY & GEMINI BENCHMARK');
  console.log('====================================================\n');

  // 1. Classification Overhead Benchmark
  const classMetrics = measureMs(() => {
    llmComplexityClassifier.classify({
      prompt: 'Summarize key points from attached context',
      feature: 'RAG_CHAT',
      context: 'Sample document context snippet'
    });
  }, 1000);
  console.log(`[Complexity Classifier] Avg: ${classMetrics.avgMs.toFixed(3)}ms | P50: ${classMetrics.p50Ms.toFixed(3)}ms | P95: ${classMetrics.p95Ms.toFixed(3)}ms | P99: ${classMetrics.p99Ms.toFixed(3)}ms`);

  // 2. Policy Routing Resolution Benchmark
  const routeMetrics = measureMs(() => {
    llmPolicyService.selectRoute(
      { prompt: 'Calculate study roadmap schedule', feature: 'ROADMAP' },
      'MEDIUM'
    );
  }, 1000);
  console.log(`[Policy Routing Resolution] Avg: ${routeMetrics.avgMs.toFixed(3)}ms | P50: ${routeMetrics.p50Ms.toFixed(3)}ms | P95: ${routeMetrics.p95Ms.toFixed(3)}ms | P99: ${routeMetrics.p99Ms.toFixed(3)}ms`);

  // 3. Token Budget Calculation Benchmark
  const budgetMetrics = measureMs(() => {
    tokenBudgetManager.applyTokenBudget('System prompt text', 'Long context string snippet', 'User query text');
  }, 500);
  console.log(`[Token Budget Optimization] Avg: ${budgetMetrics.avgMs.toFixed(3)}ms | P50: ${budgetMetrics.p50Ms.toFixed(3)}ms | P95: ${budgetMetrics.p95Ms.toFixed(3)}ms | P99: ${budgetMetrics.p99Ms.toFixed(3)}ms`);

  // 4. Circuit Breaker Evaluation Benchmark
  const cbMetrics = measureMs(() => {
    llmCircuitBreakerService.isAvailable('gemini');
    llmCircuitBreakerService.isAvailable('ollama');
    llmCircuitBreakerService.isAvailable('kimi');
  }, 1000);
  console.log(`[Circuit Breaker Status Check] Avg: ${cbMetrics.avgMs.toFixed(3)}ms | P50: ${cbMetrics.p50Ms.toFixed(3)}ms | P95: ${cbMetrics.p95Ms.toFixed(3)}ms | P99: ${cbMetrics.p99Ms.toFixed(3)}ms`);

  // 5. Rate Limiter Window Benchmark
  const start = performance.now();
  for (let i = 0; i < 100; i++) {
    await llmRateLimiterService.checkRateLimit('gemini', 'user-bench');
  }
  const rlAvg = (performance.now() - start) / 100;
  console.log(`[Rate Limiter Check] Avg: ${rlAvg.toFixed(3)}ms`);

  console.log('\n====================================================');
  console.log('🎉 BENCHMARK COMPLETED SUCCESSFULLY!');
  console.log('====================================================\n');
}

runGeminiPerformanceBenchmark();
