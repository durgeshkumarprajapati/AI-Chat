import { chatService } from '../src/features/rag/chat/chat.service';
import { prisma } from '../src/lib/prisma';
import { getRAGCacheProvider } from '../src/features/rag/cache/rag-cache.factory';
import { webFetcher } from '../src/features/rag/web/web-fetcher';

const BENCHMARK_USER = '77777777-ffff-4000-a000-999999999999';

async function runPerformanceBenchmark() {
  console.log('====================================================');
  console.log('Phase 25 — Intelligent Web Search & Evidence Fusion Performance Benchmark');
  console.log('====================================================\n');

  // Mock web fetcher for deterministic benchmark measurements
  const originalFetchUrl = webFetcher.fetchUrl.bind(webFetcher);
  webFetcher.fetchUrl = async (url: string) => {
    return {
      html: '<html><body><h1>Benchmark Security Guide</h1><p>OWASP security guidance for authentication and caching.</p></body></html>',
      finalUrl: url,
      statusCode: 200,
      headers: { 'content-type': 'text/html' }
    };
  };

  try {
    const cacheProvider = getRAGCacheProvider();
    await cacheProvider.invalidateUser(BENCHMARK_USER);
    await prisma.user.upsert({
      where: { id: BENCHMARK_USER },
      update: {},
      create: { id: BENCHMARK_USER, email: 'bench-p25@example.com', name: 'Benchmark User Phase 25' }
    });

    // 1. Cold Web Search Benchmark
    const startCold = Date.now();
    const coldRes = await chatService.sendMessage(BENCHMARK_USER, {
      question: 'What are the latest JWT security best practices?',
      sourceMode: 'web_search'
    } as any);
    const coldTotal = Date.now() - startCold;

    console.log('1. COLD WEB SEARCH LATENCY BREAKDOWN:');
    console.log(`   - Search Planning: ${coldRes.latencyTrace.searchPlanningMs ?? 0}ms`);
    console.log(`   - Provider Web Search: ${coldRes.latencyTrace.webSearchMs ?? 0}ms`);
    console.log(`   - Web Page Fetch: ${coldRes.latencyTrace.webFetchMs ?? 0}ms`);
    console.log(`   - Content Extraction: ${coldRes.latencyTrace.webExtractionMs ?? 0}ms`);
    console.log(`   - LLM Generation: ${coldRes.latencyTrace.llmMs ?? 0}ms`);
    console.log(`   - Total Response: ${coldTotal}ms (Cache: ${coldRes.cacheType || 'miss'})\n`);

    // 2. Warm Exact Cache Benchmark
    const startWarm = Date.now();
    const warmRes = await chatService.sendMessage(BENCHMARK_USER, {
      question: 'What are the latest JWT security best practices?',
      sourceMode: 'web_search'
    } as any);
    const warmTotal = Date.now() - startWarm;

    console.log('2. WARM EXACT CACHE HIT LATENCY BREAKDOWN:');
    console.log(`   - Cache Lookup: ${warmRes.latencyTrace.semanticCacheLookupMs ?? 1}ms`);
    console.log(`   - LLM Bypassed (0ms generation): ${warmRes.llmCalled ? 'NO' : 'YES'}`);
    console.log(`   - Total Response: ${warmTotal}ms (Cache: ${warmRes.cacheType || 'exact'})\n`);

    // 3. AUTO Multi-Source Query Benchmark
    const startAuto = Date.now();
    const autoRes = await chatService.sendMessage(BENCHMARK_USER, {
      question: 'Compare OWASP best practices with general security',
      sourceMode: 'auto'
    } as any);
    const autoTotal = Date.now() - startAuto;

    console.log('3. AUTO MULTI-SOURCE FUSION LATENCY BREAKDOWN:');
    console.log(`   - Query Classification: ${autoRes.latencyTrace.queryClassificationMs ?? 0}ms`);
    console.log(`   - Evidence Fusion: ${autoRes.latencyTrace.evidenceFusionMs ?? 0}ms`);
    console.log(`   - Total Response: ${autoTotal}ms (Answer Mode: ${autoRes.answerMode})\n`);

    // Cleanup
    await prisma.userFeedback.deleteMany({ where: { userId: BENCHMARK_USER } });
    await prisma.ragEvaluation.deleteMany({ where: { userId: BENCHMARK_USER } });
    await prisma.conversation.deleteMany({ where: { userId: BENCHMARK_USER } });
    await prisma.user.deleteMany({ where: { id: BENCHMARK_USER } });

    console.log('====================================================');
    console.log('🎉 PERFORMANCE BENCHMARK COMPLETED SUCCESSFULLY!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('❌ PERFORMANCE BENCHMARK FAILED:', err);
    process.exit(1);
  } finally {
    webFetcher.fetchUrl = originalFetchUrl;
  }
}

runPerformanceBenchmark();
