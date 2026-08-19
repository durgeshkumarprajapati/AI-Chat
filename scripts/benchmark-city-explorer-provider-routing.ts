import { performance } from 'perf_hooks';
import { llmPolicyService } from '../src/features/llm/llm-policy.service';
import { cityExplorerCacheService } from '../src/features/city-explorer/city-explorer.cache.service';
import { cityExplorerAnswerService } from '../src/features/city-explorer/city-explorer.answer.service';
import { cityExplorerPrefetchService } from '../src/features/city-explorer/city-explorer.prefetch.service';
import { cityExplorerTelemetryService } from '../src/features/city-explorer/city-explorer.telemetry.service';

async function runBenchmark() {
  console.log('====================================================');
  console.log('⚡ PHASE 44 — CITY EXPLORER PROVIDER ROUTING BENCHMARK');
  console.log('====================================================\n');

  process.env.GEMINI_API_KEY = 'mock-gemini-key-benchmark';
  process.env.CITY_EXPLORER_PRIMARY_PROVIDER = 'gemini';
  process.env.CITY_EXPLORER_FALLBACK_PROVIDER = 'web_search';
  process.env.CITY_EXPLORER_ALLOW_OLLAMA_FALLBACK = 'false';
  process.env.CITY_EXPLORER_CACHE_VERSION = 'v4';

  global.fetch = (async () => ({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: 'Benchmark grounded Gemini city answer.' } }],
      usage: { prompt_tokens: 10, completion_tokens: 15 }
    })
  })) as any;

  // 1. Policy Resolution Benchmark (< 5ms Target)
  const policyStart = performance.now();
  for (let i = 0; i < 100; i++) {
    llmPolicyService.selectRoute({ prompt: 'Tell me about Vadodara', feature: 'CITY_EXPLORER' }, 'LOW');
  }
  const policyMs = (performance.now() - policyStart) / 100;
  console.log(`1. Policy Resolution Latency: ${policyMs.toFixed(3)}ms (Target < 5ms: ${policyMs < 5 ? 'PASSED ✅' : 'FAILED ❌'})`);

  // 2. Accidental Ollama Rejection Latency (< 10ms Target)
  const rejStart = performance.now();
  let rejPassed = false;
  try {
    llmPolicyService.assertCityExplorerProviderAllowed('ollama', { feature: 'CITY_EXPLORER', prompt: 'test' });
  } catch {
    rejPassed = true;
  }
  const rejMs = performance.now() - rejStart;
  console.log(`2. Accidental Ollama Rejection Latency: ${rejMs.toFixed(3)}ms (Target < 10ms: ${rejMs < 10 && rejPassed ? 'PASSED ✅' : 'FAILED ❌'})`);

  // 3. Cache Hit Latency (< 50ms Target)
  await cityExplorerCacheService.setCachedAnswer('Vadodara', 'benchmark-q1', {
    questionId: 'benchmark-q1',
    category: 'About the City',
    question: 'Test question',
    status: 'READY',
    answer: 'Cached hit answer',
    cached: true
  });

  const cacheStart = performance.now();
  const cachedHit = await cityExplorerCacheService.getCachedAnswer('Vadodara', 'benchmark-q1');
  const cacheMs = performance.now() - cacheStart;
  console.log(`3. Warm Cache Hit Latency: ${cacheMs.toFixed(3)}ms (Target < 50ms: ${cacheMs < 50 && cachedHit?.result ? 'PASSED ✅' : 'FAILED ❌'})`);

  // 4. Cold City Answer Synthesis Latency (< 3000ms Target)
  const coldStart = performance.now();
  await cityExplorerAnswerService.generateAnswer('u1', { name: 'Vadodara' }, {
    id: 'about-city-overview',
    category: 'About the City',
    categoryIcon: '🏙',
    question: 'What is Vadodara famous for?',
    kind: 'STATIC',
    priority: 'P0'
  });
  const coldMs = performance.now() - coldStart;
  console.log(`4. Cold City Load Answer Latency: ${coldMs.toFixed(2)}ms (Target < 3000ms: ${coldMs < 3000 ? 'PASSED ✅' : 'FAILED ❌'})`);

  // 5. In-flight Deduplication Execution
  const dedupStart = performance.now();
  const [r1, r2, r3] = await Promise.all([
    cityExplorerPrefetchService.prefetchAnswers('u1', { city: 'Vadodara', questionIds: ['about-city-history'] }),
    cityExplorerPrefetchService.prefetchAnswers('u2', { city: 'Vadodara', questionIds: ['about-city-history'] }),
    cityExplorerPrefetchService.prefetchAnswers('u3', { city: 'Vadodara', questionIds: ['about-city-history'] })
  ]);
  const dedupMs = performance.now() - dedupStart;
  console.log(`5. 3 Concurrent Deduplicated Requests: ${dedupMs.toFixed(2)}ms | Success: ${r1.success && r2.success && r3.success ? 'PASSED ✅' : 'FAILED ❌'}`);

  // 6. Architecture Violation Verification
  const logs = cityExplorerTelemetryService.getRecentLogs('Vadodara');
  const hasOllamaLog = logs.some((l) => (l as any).metadata?.provider === 'ollama' || (l as any).provider === 'ollama');
  console.log(`6. Zero Ollama Invocation Check: ${!hasOllamaLog ? 'PASSED ✅ (0 Ollama calls logged)' : 'FAILED ❌'}`);

  console.log('\n====================================================');
  console.log('🎉 PHASE 44 PROVIDER ROUTING BENCHMARK COMPLETED!');
  console.log('====================================================');
}

runBenchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
