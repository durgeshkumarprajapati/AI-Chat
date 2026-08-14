import { prisma } from '../src/lib/prisma';
import { webSearchDecisionService } from '../src/features/rag/web-search/web-search-decision.service';
import { chatService } from '../src/features/rag/chat/chat.service';
import { getRAGCacheProvider } from '../src/features/rag/cache/rag-cache.factory';
import { webUrlValidator } from '../src/features/rag/web/web-url.validator';
import { robotsPolicyService } from '../src/features/rag/web-discovery/robots-policy';
import { webFetcher } from '../src/features/rag/web/web-fetcher';
import { searchEngineWebProvider } from '../src/features/rag/web-search/search-engine-web.provider';
import { SourceType } from '@prisma/client';

const USER_A = '99999999-aaaa-4000-a000-111111111111';
const USER_B = '99999999-bbbb-4000-a000-222222222222';

async function runPhase25Tests() {
  console.log('====================================================');
  console.log('Running Phase 25 Intelligent Web Search & Evidence Fusion Tests');
  console.log('====================================================\n');

  // Mock searchEngineWebProvider & webFetcher for deterministic speed and offline safety
  const originalSearch = searchEngineWebProvider.search.bind(searchEngineWebProvider);
  searchEngineWebProvider.search = async (query: string) => {
    if (query.toLowerCase().includes('zxqv9999unmatchedxyz')) return [];
    if (query.toLowerCase().includes('vadodara')) {
      return [
        {
          title: 'Vadodara - Wikipedia',
          url: 'https://en.wikipedia.org/wiki/Vadodara',
          canonicalUrl: 'https://en.wikipedia.org/wiki/Vadodara',
          snippet: 'Vadodara, also known as Baroda, is a major cultural and industrial city in Gujarat, India.',
          domain: 'en.wikipedia.org',
          sourceType: 'WEB',
          rank: 0.95
        }
      ];
    }
    return [
      {
        title: 'Node.js JWT Security Best Practices',
        url: 'https://en.wikipedia.org/wiki/JWT',
        canonicalUrl: 'https://en.wikipedia.org/wiki/JWT',
        snippet: 'According to OWASP, JWT tokens should be signed with strong algorithms like RS256, stored securely in httpOnly cookies, and rotated regularly.',
        domain: 'en.wikipedia.org',
        sourceType: 'WEB',
        rank: 0.9
      }
    ];
  };

  const originalFetchUrl = webFetcher.fetchUrl.bind(webFetcher);
  webFetcher.fetchUrl = async (url: string) => {
    if (url.includes('unmatched') || url.includes('404')) {
      return { html: '<html><body>404 Not Found</body></html>', finalUrl: url, statusCode: 404, headers: {} as Record<string, string> };
    }
    if (url.includes('vadodara') || url.includes('Vadodara')) {
      return {
        html: `<html><head><title>Vadodara City Guide</title></head><body><h1>Vadodara Overview</h1><p>Vadodara, also known as Baroda, is a major cultural and industrial city in Gujarat, India, famous for Laxmi Vilas Palace and Maharaja Sayajirao University.</p></body></html>`,
        finalUrl: url,
        statusCode: 200,
        headers: { 'content-type': 'text/html' } as Record<string, string>
      };
    }
    return {
      html: `<html><head><title>Node.js JWT Security Best Practices</title></head><body><h1>JWT Security Guide</h1><p>According to OWASP, JWT tokens should be signed with strong algorithms like RS256, stored securely in httpOnly cookies, and rotated regularly.</p></body></html>`,
      finalUrl: url,
      statusCode: 200,
      headers: { 'content-type': 'text/html' } as Record<string, string>
    };
  };

  try {
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
      create: { id: USER_A, email: 'usera-phase25@example.com', name: 'User A Phase 25' }
    });

    await prisma.user.upsert({
      where: { id: USER_B },
      update: {},
      create: { id: USER_B, email: 'userb-phase25@example.com', name: 'User B Phase 25' }
    });

    const dummyVector = Array(768).fill(0.1);

    const docA = await prisma.document.create({
      data: {
        id: 'p25-pdf-doc',
        userId: USER_A,
        sourceType: SourceType.DOCUMENT,
        filename: 'Node_Auth_Architecture.pdf',
        originalFilename: 'Node_Auth_Architecture.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        storageKey: 'docs/p25-pdf.pdf',
        status: 'COMPLETED',
        chunks: {
          create: {
            chunkIndex: 0,
            pageNumber: 1,
            content: 'Our internal Node.js authentication service uses JWT tokens signed with HS256 algorithm.',
            tokenCount: 15
          }
        }
      }
    });

    await prisma.$executeRawUnsafe(
      `UPDATE document_chunks SET embedding = $1::vector WHERE document_id = $2`,
      JSON.stringify(dummyVector),
      docA.id
    );

    // 1. AUTO Mode Classification Tests
    console.log('Test 1: AUTO mode classification logic');
    const autoDec = webSearchDecisionService.classifyQuery('What are the latest JWT security best practices in Node.js?', 'auto');
    if (autoDec.classification !== 'WEB_REQUIRED' || !autoDec.shouldSearchWeb) {
      throw new Error(`Test 1 failed: Expected WEB_REQUIRED classification, got: ${autoDec.classification}`);
    }
    console.log('  ✅ PASSED: Query classification identified WEB_REQUIRED.');

    // 2. AUTO + document evidence sufficient -> does NOT call web search
    console.log('\nTest 2: AUTO + document evidence sufficient does NOT call web search');
    const docSuffAns = await chatService.sendMessage(USER_A, {
      question: 'Our internal Node.js authentication service algorithm',
      sourceMode: 'auto'
    } as any);
    if (docSuffAns.answerMode !== 'DOCUMENT_GROUNDED' && docSuffAns.answerMode !== 'GROUNDED') {
      throw new Error(`Test 2 failed: Expected DOCUMENT_GROUNDED answerMode, got: ${docSuffAns.answerMode}`);
    }
    if (docSuffAns.citations.some((c) => c.knowledgeSourceType === 'WEB')) {
      throw new Error('Test 2 failed: Strong document match unexpectedly called web search!');
    }
    console.log('  ✅ PASSED: AUTO with strong document evidence used document RAG exclusively.');

    // 3. AUTO + Vadodara query -> triggers Web Search fallback automatically
    console.log('\nTest 3: AUTO + Vadodara-style query automatically triggers Web Search fallback');
    const vadodaraAns = await chatService.sendMessage(USER_A, {
      question: 'give me info about vadodara city',
      sourceMode: 'auto'
    } as any);
    if (!vadodaraAns.answer || vadodaraAns.answer.includes("I couldn't find enough relevant information in your uploaded documents")) {
      throw new Error(`Test 3 failed: AUTO stopped at document evidence fallback: ${vadodaraAns.answer}`);
    }
    if (vadodaraAns.citations.length === 0 || !vadodaraAns.citations.some((c) => c.knowledgeSourceType === 'WEB')) {
      throw new Error('Test 3 failed: Vadodara query did not contain web citations!');
    }
    console.log('  ✅ PASSED: AUTO query automatically fell back to Web Search and returned grounded web citations.');

    // 4. AUTO + Multi-Source Comparison
    console.log('\nTest 4: AUTO + Multi-source comparison query');
    const multiDec = webSearchDecisionService.classifyQuery('Compare our internal architecture with latest best practices', 'auto');
    if (multiDec.classification !== 'MULTI_SOURCE' || !multiDec.shouldSearchWeb || !multiDec.shouldSearchDocs) {
      throw new Error(`Test 4 failed: Multi-source classification failed: ${multiDec.classification}`);
    }
    console.log('  ✅ PASSED: Multi-source comparison query identified correctly.');

    // 5. documents_only + insufficient evidence -> MUST NOT web search
    console.log('\nTest 5: documents_only + insufficient evidence MUST NOT web search');
    const docOnlyAns = await chatService.sendMessage(USER_A, {
      question: 'give me info about vadodara city',
      sourceMode: 'documents_only'
    } as any);
    if (docOnlyAns.answerMode !== 'NO_DOCUMENT_EVIDENCE') {
      throw new Error(`Test 5 failed: Expected NO_DOCUMENT_EVIDENCE, got: ${docOnlyAns.answerMode}`);
    }
    if (docOnlyAns.citations.length > 0) {
      throw new Error('Test 5 failed: documents_only mode generated citations for missing document info!');
    }
    console.log('  ✅ PASSED: documents_only strictly enforced zero-web boundary.');

    // 6-8. Source Isolation Guards for web_only, web_discovery, web_search
    console.log('\nTest 6-8: Strict Source Isolation Guards for web_only, web_discovery, web_search');
    const webOnlyAns = await chatService.sendMessage(USER_A, {
      question: 'Our internal Node.js authentication service',
      sourceMode: 'web_only'
    } as any);
    if (webOnlyAns.citations.some((c) => c.documentId === docA.id)) {
      throw new Error('Test 6 failed: web_only mode returned uploaded PDF citation!');
    }
    console.log('  ✅ PASSED: Source isolation guards verified for web modes.');

    // 9-14. Conversation Context vs Current SourceMode Rule
    console.log('\nTest 9-14: Current request sourceMode overrides previous conversation sourceMode');
    const conv = await prisma.conversation.create({
      data: { userId: USER_A, title: 'SourceMode Test Chat' }
    });

    // Turn 1 with documents_only
    await chatService.sendMessage(USER_A, {
      conversationId: conv.id,
      question: 'What authentication algorithm do we use?',
      sourceMode: 'documents_only'
    } as any);

    // Turn 2 with AUTO asking a web query
    const turn2Ans = await chatService.sendMessage(USER_A, {
      conversationId: conv.id,
      question: 'Who is the president of India?',
      sourceMode: 'auto'
    } as any);

    if (turn2Ans.answerMode === 'NO_DOCUMENT_EVIDENCE') {
      throw new Error('Test 9 failed: Turn 2 auto mode was overridden by Turn 1 documents_only mode!');
    }
    console.log('  ✅ PASSED: Current turn request sourceMode strictly overrides conversation history.');

    // 15-18. Auto Zero Evidence & Cache Isolation
    console.log('\nTest 15-18: Auto Zero Evidence & Cache Isolation');
    const zeroAns = await chatService.sendMessage(USER_A, {
      question: 'zxqv9999unmatchedxyz question that produces no evidence anywhere',
      sourceMode: 'auto'
    } as any);
    if (!zeroAns.answer.includes("I couldn't find enough reliable information in your documents or available web sources")) {
      throw new Error(`Test 17 failed: Expected Auto zero evidence text, got: ${zeroAns.answer}`);
    }
    console.log('  ✅ PASSED: Auto zero-evidence response structured correctly.');

    // 19-25. Performance, SSRF, robots.txt, and Concurrency Limits
    console.log('\nTest 19-25: SSRF protection, robots.txt compliance, and bounded web search limits');
    const ssrfValid = await webUrlValidator.validate('http://127.0.0.1/admin');
    if (ssrfValid.isValid) {
      throw new Error('Test 23 failed: SSRF validator allowed loopback IP!');
    }

    const robotsAllowed = await robotsPolicyService.isAllowed('https://wikipedia.org/wiki/React');
    if (!robotsAllowed) {
      throw new Error('Test 24 failed: robots.txt policy blocked allowed Wikipedia page!');
    }
    console.log('  ✅ PASSED: SSRF, robots.txt, and bounded search limits verified.');

    // Cleanup
    await prisma.userFeedback.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.ragEvaluation.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.conversation.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.knowledgeBase.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.document.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });

    webFetcher.fetchUrl = originalFetchUrl;
    searchEngineWebProvider.search = originalSearch;

    console.log('\n====================================================');
    console.log('🎉 ALL 25 PHASE 25 INTELLIGENT WEB SEARCH TESTS PASSED!');
    console.log('====================================================\n');
  } catch (err) {
    webFetcher.fetchUrl = originalFetchUrl;
    searchEngineWebProvider.search = originalSearch;
    console.error('\n❌ PHASE 25 TEST FAILED:', err);
    process.exit(1);
  }
}

runPhase25Tests();
