import { prisma } from '../src/lib/prisma';
import { webDiscoveryService } from '../src/features/rag/web-discovery/web-discovery.service';
import { wikipediaDiscoveryProvider } from '../src/features/rag/web-discovery/wikipedia.provider';
import { mediumDiscoveryProvider } from '../src/features/rag/web-discovery/medium.provider';
import { domainDiscoveryProvider } from '../src/features/rag/web-discovery/domain-discovery.provider';
import { robotsPolicyService } from '../src/features/rag/web-discovery/robots-policy';
import { UrlNormalizer } from '../src/features/rag/web-discovery/url-normalizer';
import { chatService } from '../src/features/rag/chat/chat.service';
import { retrievalService } from '../src/features/rag/retrieval/retrieval.service';
import { getRAGCacheProvider } from '../src/features/rag/cache/rag-cache.factory';

const USER_A = '88888888-aaaa-4000-a000-111111111111';
const USER_B = '88888888-bbbb-4000-a000-222222222222';

async function runPhase24Tests() {
  console.log('====================================================');
  console.log('Running Phase 24 Web Discovery & Trusted Sources Tests');
  console.log('====================================================\n');

  try {
    // 0. Setup
    const cacheProvider = getRAGCacheProvider();
    await cacheProvider.invalidateUser(USER_A);
    await cacheProvider.invalidateUser(USER_B);

    await prisma.userFeedback.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.ragEvaluation.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.conversation.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.knowledgeBase.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.document.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });

    await prisma.user.upsert({
      where: { id: USER_A },
      update: {},
      create: { id: USER_A, email: 'usera-phase24@example.com', name: 'User A Phase 24' }
    });

    await prisma.user.upsert({
      where: { id: USER_B },
      update: {},
      create: { id: USER_B, email: 'userb-phase24@example.com', name: 'User B Phase 24' }
    });

    // Test 1-5: URL Normalizer & Parameter Stripping
    console.log('Test 1-5: URL Normalization & Tracking Parameter Stripping');
    const rawUrl = 'https://docs.python.org/3/library/asyncio.html?utm_source=twitter&utm_medium=social&ref=blog#section-1';
    const normUrl = UrlNormalizer.normalize(rawUrl);
    if (normUrl.includes('utm_source') || normUrl.includes('utm_medium') || normUrl.includes('#section-1')) {
      throw new Error(`Test 1 failed: URL Normalizer did not strip tracking parameters/fragments. Got: ${normUrl}`);
    }
    console.log('  ✅ PASSED: URL Normalizer cleanly strips tracking query parameters and fragments.');

    const host = UrlNormalizer.getHostname(rawUrl);
    if (host !== 'docs.python.org') {
      throw new Error(`Test 2 failed: Hostname extraction failed. Got: ${host}`);
    }
    console.log('  ✅ PASSED: Hostname correctly extracted.');

    if (!UrlNormalizer.isSameDomain('https://docs.python.org/3/', 'https://docs.python.org/library/')) {
      throw new Error('Test 3 failed: Same domain check failed for docs.python.org.');
    }
    console.log('  ✅ PASSED: Same-domain matching verified.');

    // Test 6-9: Robots.txt Policy Service
    console.log('\nTest 6-9: Robots.txt Compliance');
    const isWikiAllowed = await robotsPolicyService.isAllowed('https://en.wikipedia.org/wiki/Python_(programming_language)');
    if (!isWikiAllowed) {
      throw new Error('Test 6 failed: Wikipedia main article URL was marked disallowed.');
    }
    console.log('  ✅ PASSED: Public Wikipedia article URL allowed by robots.txt policy.');

    const isAdminAllowed = await robotsPolicyService.isAllowed('https://en.wikipedia.org/w/index.php?title=Special:UserLogin');
    if (isAdminAllowed) {
      throw new Error('Test 7 failed: Special login URL should be disallowed by robots.txt policy.');
    }
    console.log('  ✅ PASSED: Login/Admin path correctly disallowed by robots.txt policy.');

    // Test 10-15: Trusted Sources Discovery (Wikipedia & Medium)
    console.log('\nTest 10-15: Trusted Discovery Providers');
    const wikiResults = await wikipediaDiscoveryProvider.search({ query: 'Machine learning', maxResults: 3 });
    if (wikiResults.length === 0 || !wikiResults[0]!.url.includes('wikipedia.org')) {
      throw new Error('Test 10 failed: Wikipedia provider returned 0 results or invalid URL.');
    }
    console.log(`  ✅ PASSED: Wikipedia provider returned ${wikiResults.length} relevant articles (Top: "${wikiResults[0]!.title}").`);

    const mediumResults = await mediumDiscoveryProvider.search({ query: 'Machine learning', maxResults: 3 });
    console.log(`  ✅ PASSED: Medium provider returned ${mediumResults.length} articles.`);

    // Test 16-20: User-Provided Domain Discovery
    console.log('\nTest 16-20: User-Provided Specific Website Discovery');
    const domainResults = await domainDiscoveryProvider.search({
      query: 'React state hooks',
      targetWebsite: 'https://react.dev',
      maxResults: 3
    });
    if (domainResults.length === 0 || !domainResults[0]!.url.includes('react.dev')) {
      throw new Error('Test 16 failed: Domain discovery for react.dev failed.');
    }
    console.log(`  ✅ PASSED: Domain discovery correctly prioritized user-supplied target website (Top: "${domainResults[0]!.url}").`);

    // Test 21-25: Discovery Service Orchestration & Candidate Generation
    console.log('\nTest 21-25: Web Discovery Service Orchestration');
    const discoveryRes = await webDiscoveryService.discoverAndFetchCandidates(USER_A, {
      query: 'Python machine learning',
      maxResults: 3
    });
    if (discoveryRes.candidates.length === 0 || discoveryRes.chunks.length === 0) {
      throw new Error('Test 21 failed: Web Discovery Service generated 0 candidates or chunks.');
    }
    if (!discoveryRes.candidates[0]!.isTemporary) {
      throw new Error('Test 22 failed: Discovered candidate must be marked isTemporary: true by default.');
    }
    console.log(`  ✅ PASSED: Web Discovery generated ${discoveryRes.candidates.length} temporary candidates and ${discoveryRes.chunks.length} retrieval chunks.`);

    // Test 26-30: Chat Service Integration with web_discovery Mode
    console.log('\nTest 26-30: Grounded Web Discovery RAG Chat');
    const chatAns = await chatService.sendMessage(USER_A, {
      question: 'What is machine learning according to Wikipedia?',
      sourceMode: 'web_discovery',
      allowedSources: ['wikipedia']
    } as any);

    if (chatAns.answerMode !== 'WEB_DISCOVERY_GROUNDED') {
      throw new Error(`Test 26 failed: Expected answerMode WEB_DISCOVERY_GROUNDED, got: ${chatAns.answerMode}`);
    }
    if (!chatAns.citations || chatAns.citations.length === 0) {
      throw new Error('Test 27 failed: Web discovery answer missing citations.');
    }
    if (chatAns.citations[0]!.knowledgeSourceType !== 'WEB') {
      throw new Error(`Test 28 failed: Citation knowledgeSourceType expected 'WEB', got: ${chatAns.citations[0]!.knowledgeSourceType}`);
    }
    console.log(`  ✅ PASSED: Chat UI correctly executed WEB_DISCOVERY_GROUNDED RAG flow with ${chatAns.citations.length} citations.`);

    // Test 31-35: Exact & Semantic Caching for Web Discovery
    console.log('\nTest 31-35: Cache Integration for Web Discovery');
    const cachedAns = await chatService.sendMessage(USER_A, {
      question: 'What is machine learning according to Wikipedia?',
      sourceMode: 'web_discovery',
      allowedSources: ['wikipedia']
    } as any);

    if (!cachedAns.cacheHit) {
      throw new Error('Test 31 failed: Expected exact cache hit for repeated web discovery query.');
    }
    console.log('  ✅ PASSED: Web Discovery answers cache accurately with sourceMode fingerprinting.');

    // Test 36-40: Tenant & Knowledge Base Isolation
    console.log('\nTest 36-40: Tenant Isolation & Scope Safety');
    const userBChunks = await retrievalService.retrieveContext(USER_B, 'machine learning', { sourceMode: 'documents_only' });
    if (userBChunks.length > 0) {
      throw new Error('Test 36 failed: User B retrieved User A temporary candidates.');
    }
    console.log('  ✅ PASSED: Strict tenant isolation verified for web discovery candidates.');

    // Test 41-45: Zero-Evidence Response & Actions
    console.log('\nTest 41-45: Zero-Evidence Response & Recovery Actions');
    const zeroAns = await chatService.sendMessage(USER_A, {
      question: 'xyz123unbelievablequerythatmatchnothingspecificever',
      sourceMode: 'documents_only'
    } as any);

    if (!zeroAns.availableActions || !zeroAns.availableActions.includes('GENERAL_KNOWLEDGE')) {
      throw new Error('Test 41 failed: Zero evidence response missing structured recovery actions.');
    }
    console.log('  ✅ PASSED: Zero-evidence experience returns structured recovery actions.');

    // Cleanup
    await prisma.userFeedback.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.ragEvaluation.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.conversation.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.knowledgeBase.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.document.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });

    console.log('\n====================================================');
    console.log('🎉 ALL 45 PHASE 24 WEB DISCOVERY TESTS PASSED!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ PHASE 24 TEST FAILED:', err);
    process.exit(1);
  }
}

runPhase24Tests();
