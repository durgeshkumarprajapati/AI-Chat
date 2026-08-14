import { chatService } from '../src/features/rag/chat/chat.service';
import { prisma } from '../src/lib/prisma';
import { getRAGCacheProvider } from '../src/features/rag/cache/rag-cache.factory';

const PERF_USER_ID = '99999999-aaaa-4000-a000-111111111111';

async function runWebDiscoveryBenchmark() {
  console.log('===========================================================');
  console.log('Phase 24 Web Discovery & Latency Performance Benchmark');
  console.log('===========================================================\n');

  try {
    const cacheProvider = getRAGCacheProvider();
    await cacheProvider.invalidateUser(PERF_USER_ID);

    await prisma.user.upsert({
      where: { id: PERF_USER_ID },
      update: {},
      create: { id: PERF_USER_ID, email: 'perf-user-p24@example.com', name: 'Perf User Phase 24' }
    });

    // 1. Cold Web Discovery Request
    console.log('1. Measuring Cold Web Discovery Latency...');
    const startCold = Date.now();
    const coldAns = await chatService.sendMessage(PERF_USER_ID, {
      question: 'What is Artificial Intelligence according to Wikipedia?',
      sourceMode: 'web_discovery',
      allowedSources: ['wikipedia']
    } as any);
    const totalColdMs = Date.now() - startCold;
    console.log(`   Cold Web Discovery Total Latency: ${totalColdMs}ms`);
    console.log(`   Answer Mode: ${coldAns.answerMode}`);
    console.log(`   Citations Count: ${coldAns.citations.length}`);
    console.log(`   Discovery Ms: ${coldAns.latencyTrace?.discoveryMs || 0}ms`);
    console.log(`   Fetch Ms: ${coldAns.latencyTrace?.fetchMs || 0}ms`);
    console.log(`   LLM Ms: ${coldAns.latencyTrace?.llmMs || 0}ms\n`);

    // 2. Cached Web Discovery Request
    console.log('2. Measuring Cached Web Discovery Latency...');
    const startCached = Date.now();
    const cachedAns = await chatService.sendMessage(PERF_USER_ID, {
      question: 'What is Artificial Intelligence according to Wikipedia?',
      sourceMode: 'web_discovery',
      allowedSources: ['wikipedia']
    } as any);
    const totalCachedMs = Date.now() - startCached;
    console.log(`   Cached Web Discovery Total Latency: ${totalCachedMs}ms`);
    console.log(`   Cache Hit: ${cachedAns.cacheHit} (${cachedAns.cacheType})\n`);

    // 3. User Domain Discovery Request
    console.log('3. Measuring User Domain Specific Discovery Latency...');
    const startDomain = Date.now();
    const domainAns = await chatService.sendMessage(PERF_USER_ID, {
      question: 'Python asyncio documentation',
      sourceMode: 'web_discovery',
      targetWebsite: 'https://docs.python.org'
    } as any);
    const totalDomainMs = Date.now() - startDomain;
    console.log(`   Specific Website Discovery Total Latency: ${totalDomainMs}ms`);
    console.log(`   Answer Mode: ${domainAns.answerMode}`);
    console.log(`   Citations Count: ${domainAns.citations.length}\n`);

    // Cleanup
    await prisma.userFeedback.deleteMany({ where: { userId: PERF_USER_ID } });
    await prisma.ragEvaluation.deleteMany({ where: { userId: PERF_USER_ID } });
    await prisma.conversation.deleteMany({ where: { userId: PERF_USER_ID } });
    await prisma.user.delete({ where: { id: PERF_USER_ID } });

    console.log('===========================================================');
    console.log('🎉 PHASE 24 BENCHMARK COMPLETED SUCCESSFULLY!');
    console.log('===========================================================\n');
  } catch (err) {
    console.error('❌ Benchmark Failed:', err);
    process.exit(1);
  }
}

runWebDiscoveryBenchmark();
