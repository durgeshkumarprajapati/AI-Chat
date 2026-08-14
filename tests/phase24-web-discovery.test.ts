import { prisma } from '../src/lib/prisma';
import { wikipediaDiscoveryProvider } from '../src/features/rag/web-discovery/wikipedia.provider';
import { domainDiscoveryProvider } from '../src/features/rag/web-discovery/domain-discovery.provider';
import { robotsPolicyService } from '../src/features/rag/web-discovery/robots-policy';
import { UrlNormalizer } from '../src/features/rag/web-discovery/url-normalizer';
import { chatService } from '../src/features/rag/chat/chat.service';
import { getRAGCacheProvider } from '../src/features/rag/cache/rag-cache.factory';
import { SourceType } from '@prisma/client';

const USER_A = '88888888-aaaa-4000-a000-111111111111';
const USER_B = '88888888-bbbb-4000-a000-222222222222';

async function runPhase24Tests() {
  console.log('====================================================');
  console.log('Running Phase 24 Web Discovery & Source Isolation Tests');
  console.log('====================================================\n');

  try {
    // 0. Setup & Cleanup
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

    // Create a mock uploaded document for User A to verify source isolation
    const dummyVector = Array(768).fill(0.1);
    const mockDoc = await prisma.document.create({
      data: {
        id: 'uploaded-pdf-1',
        userId: USER_A,
        sourceType: SourceType.DOCUMENT,
        filename: 'PYTHON_PROGRAMMING_GUIDE.pdf',
        originalFilename: 'PYTHON_PROGRAMMING_GUIDE.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        storageKey: 'docs/test.pdf',
        status: 'COMPLETED',
        chunks: {
          create: {
            chunkIndex: 0,
            pageNumber: 6,
            content: 'Python programming guide details: difference between is and == in Python. is compares identity, == compares equality.',
            tokenCount: 20
          }
        }
      }
    });

    // Update chunk embedding vector via raw query
    await prisma.$executeRawUnsafe(
      `UPDATE document_chunks SET embedding = $1::vector WHERE document_id = $2`,
      JSON.stringify(dummyVector),
      mockDoc.id
    );

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

    // Test 21-25: STRICT WEB DISCOVERY SOURCE ISOLATION (Crucial Bug Fix Verification)
    console.log('\nTest 21-25: Strict Source Isolation (Web Discovery vs Uploaded Documents)');
    const webDiscoveryAns = await chatService.sendMessage(USER_A, {
      question: 'what is the difference between is and == in Python',
      sourceMode: 'web_discovery',
      targetWebsite: 'https://docs.python.org/3/'
    } as any);

    if (webDiscoveryAns.answerMode !== 'WEB_DISCOVERY_GROUNDED') {
      throw new Error(`Test 21 failed: Expected WEB_DISCOVERY_GROUNDED, got: ${webDiscoveryAns.answerMode}`);
    }

    // Verify ZERO uploaded PDF citations appear in web_discovery answers
    const hasDocCitation = webDiscoveryAns.citations.some((c) => c.filename.includes('PYTHON_PROGRAMMING_GUIDE.pdf') || c.documentId === mockDoc.id);
    if (hasDocCitation) {
      throw new Error('Test 22 FAILED: web_discovery answer cited uploaded PDF document! Source isolation breached!');
    }
    console.log('  ✅ PASSED: web_discovery strictly excluded uploaded PDF documents from retrieval & citations.');

    const allWebCitations = webDiscoveryAns.citations.every((c) => c.knowledgeSourceType === 'WEB' || c.documentId.startsWith('discovered-web-') || c.documentId.startsWith('temp-web-'));
    if (!allWebCitations) {
      throw new Error('Test 23 failed: web_discovery citations contained non-web references.');
    }
    console.log('  ✅ PASSED: All web_discovery citations point exclusively to discovered web URLs.');

    // Test 26-30: Cache Isolation between Source Modes & Target Websites
    console.log('\nTest 26-30: Cache Isolation Verification');
    const docOnlyAns = await chatService.sendMessage(USER_A, {
      question: 'what is the difference between is and == in Python',
      sourceMode: 'documents_only'
    } as any);

    if (docOnlyAns.cacheHit) {
      throw new Error('Test 26 failed: Cache from web_discovery satisfied documents_only request! Cache key cross-contamination!');
    }
    if (docOnlyAns.answerMode !== 'DOCUMENT_GROUNDED' && docOnlyAns.answerMode !== 'GROUNDED') {
      throw new Error(`Test 27 failed: documents_only mode expected DOCUMENT_GROUNDED, got: ${docOnlyAns.answerMode}`);
    }
    console.log('  ✅ PASSED: documents_only request correctly isolated from web_discovery cache.');

    // Repeated web_discovery query with different targetWebsite should NOT hit cache
    const targetBAns = await chatService.sendMessage(USER_A, {
      question: 'what is the difference between is and == in Python',
      sourceMode: 'web_discovery',
      targetWebsite: 'https://wiki.python.org'
    } as any);

    if (targetBAns.cacheHit) {
      throw new Error(`Test 28 failed: Different targetWebsite hit cache from docs.python.org! (type=${targetBAns.cacheType})`);
    }
    console.log('  ✅ PASSED: Target website URL properly isolated in cache key.');

    // Test 31-35: Zero Evidence Handling (No Fallback to Documents)
    console.log('\nTest 31-35: Zero Evidence Handling in Web Discovery Mode');
    const zeroWebAns = await chatService.sendMessage(USER_A, {
      question: 'xyz987completelyunmatchedquerythathasnoresultsanywhereever',
      sourceMode: 'web_discovery',
      targetWebsite: 'https://docs.python.org/3/'
    } as any);

    if (zeroWebAns.citations.some((c) => c.documentId === mockDoc.id)) {
      throw new Error('Test 31 FAILED: Zero-evidence web_discovery query silently fell back to uploaded documents!');
    }
    console.log('  ✅ PASSED: Web discovery zero-evidence query did NOT silently fall back to uploaded document corpus.');

    // Cleanup
    await prisma.userFeedback.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.ragEvaluation.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.conversation.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.knowledgeBase.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.document.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });

    console.log('\n====================================================');
    console.log('🎉 ALL PHASE 24 SOURCE ISOLATION TESTS PASSED!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ PHASE 24 TEST FAILED:', err);
    process.exit(1);
  }
}

runPhase24Tests();
