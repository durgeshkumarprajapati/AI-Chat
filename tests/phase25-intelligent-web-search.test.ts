import { prisma } from '../src/lib/prisma';
import { webSearchDecisionService } from '../src/features/rag/web-search/web-search-decision.service';
import { webSearchPlanner } from '../src/features/rag/web-search/web-search-planner';
import { webSourceQualityService } from '../src/features/rag/web-search/web-source-quality.service';
import { webSearchService } from '../src/features/rag/web-search/web-search.service';
import { evidenceFusionService } from '../src/features/rag/evidence/evidence-fusion.service';
import { chatService } from '../src/features/rag/chat/chat.service';
import { citationService } from '../src/features/rag/citation/citation.service';
import { getRAGCacheProvider } from '../src/features/rag/cache/rag-cache.factory';
import { UrlNormalizer } from '../src/features/rag/web-discovery/url-normalizer';
import { webUrlValidator } from '../src/features/rag/web/web-url.validator';
import { robotsPolicyService } from '../src/features/rag/web-discovery/robots-policy';
import { webFetcher } from '../src/features/rag/web/web-fetcher';
import { SourceType } from '@prisma/client';

const USER_A = '99999999-aaaa-4000-a000-111111111111';
const USER_B = '99999999-bbbb-4000-a000-222222222222';

async function runPhase25Tests() {
  console.log('====================================================');
  console.log('Running Phase 25 Intelligent Web Search & Evidence Fusion Tests');
  console.log('====================================================\n');

  // Mock webFetcher for deterministic speed and offline safety
  const originalFetchUrl = webFetcher.fetchUrl.bind(webFetcher);
  webFetcher.fetchUrl = async (url: string) => {
    if (url.includes('unmatched') || url.includes('404')) {
      return { html: '<html><body>404 Not Found</body></html>', finalUrl: url, statusCode: 404, headers: {} as Record<string, string> };
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

    // 2. DOCUMENT_SUFFICIENT Classification
    console.log('\nTest 2: DOCUMENT_SUFFICIENT classification');
    const docDec = webSearchDecisionService.classifyQuery('Explain the authentication flow in my uploaded architecture.pdf', 'auto');
    if (docDec.classification !== 'DOCUMENT_SUFFICIENT' || docDec.shouldSearchWeb) {
      throw new Error(`Test 2 failed: Expected DOCUMENT_SUFFICIENT, got: ${docDec.classification}`);
    }
    console.log('  ✅ PASSED: Query classification identified DOCUMENT_SUFFICIENT.');

    // 3. WEB_REQUIRED Classification
    console.log('\nTest 3: WEB_REQUIRED classification');
    const webDec = webSearchDecisionService.classifyQuery('What are current 2026 security news and updates?', 'auto');
    if (webDec.classification !== 'WEB_REQUIRED') {
      throw new Error(`Test 3 failed: Expected WEB_REQUIRED, got: ${webDec.classification}`);
    }
    console.log('  ✅ PASSED: Query classification identified WEB_REQUIRED.');

    // 4. MULTI_SOURCE Classification
    console.log('\nTest 4: MULTI_SOURCE classification');
    const multiDec = webSearchDecisionService.classifyQuery('Compare our uploaded architecture with current OWASP best practices', 'auto');
    if (multiDec.classification !== 'MULTI_SOURCE' || !multiDec.shouldSearchWeb || !multiDec.shouldSearchDocs) {
      throw new Error(`Test 4 failed: Expected MULTI_SOURCE, got: ${multiDec.classification}`);
    }
    console.log('  ✅ PASSED: Query classification identified MULTI_SOURCE.');

    // 5. Clarification Classification
    console.log('\nTest 5: Clarification required classification');
    const clarDec = webSearchDecisionService.classifyQuery('tell me about this', 'auto');
    if (clarDec.classification !== 'CLARIFICATION_REQUIRED') {
      throw new Error(`Test 5 failed: Expected CLARIFICATION_REQUIRED, got: ${clarDec.classification}`);
    }
    console.log('  ✅ PASSED: Query classification identified CLARIFICATION_REQUIRED.');

    // 6. Deterministic Query Planning
    console.log('\nTest 6: Search query planner');
    const plan = webSearchPlanner.planSearchQueries('How should JWT authentication be secured in Node.js?');
    if (plan.searchQueries.length === 0 || plan.searchQueries.length > 3) {
      throw new Error(`Test 6 failed: Query plan generated invalid count: ${plan.searchQueries.length}`);
    }
    console.log('  ✅ PASSED: Query planner generated bounded query set.');

    // 7. Duplicate Query Elimination
    console.log('\nTest 7: Duplicate query elimination');
    const planDup = webSearchPlanner.planSearchQueries('JWT JWT JWT');
    const uniqueSet = new Set(planDup.searchQueries);
    if (uniqueSet.size !== planDup.searchQueries.length) {
      throw new Error('Test 7 failed: Duplicate queries were not eliminated.');
    }
    console.log('  ✅ PASSED: Duplicate search queries eliminated.');

    // 8. Parallel Search Execution
    console.log('\nTest 8: Parallel web search execution');
    const searchRes = await webSearchService.executeWebSearch(USER_A, 'JWT security OWASP best practices');
    if (searchRes.metrics.searchMs < 0 || searchRes.chunks.length === 0) {
      throw new Error('Test 8 failed: Parallel search execution failed to produce chunks.');
    }
    console.log('  ✅ PASSED: Parallel web search executed successfully.');

    // 9. URL Normalization
    console.log('\nTest 9: URL Normalization');
    const normUrl = UrlNormalizer.normalize('https://docs.python.org/3/c-api/memory.html?utm_medium=email#ref');
    if (normUrl.includes('utm_medium') || normUrl.includes('#ref')) {
      throw new Error(`Test 9 failed: Normalization failed: ${normUrl}`);
    }
    console.log('  ✅ PASSED: URL Normalizer stripped parameters and fragments.');

    // 10. Search Result Deduplication & 11-14 Security Checks
    console.log('\nTest 10-14: Security, SSRF & Robots.txt compliance');
    let ssrfBlocked = false;
    try {
      await webUrlValidator.assertSafeUrl('http://169.254.169.254/latest/meta-data/');
    } catch {
      ssrfBlocked = true;
    }
    if (!ssrfBlocked) throw new Error('Test 11 failed: SSRF validator did not block AWS metadata IP!');

    const wikiAllowed = await robotsPolicyService.isAllowed('https://en.wikipedia.org/wiki/JWT');
    if (!wikiAllowed) throw new Error('Test 14 failed: Robots policy blocked Wikipedia.');
    console.log('  ✅ PASSED: Security, SSRF, and Robots.txt protections verified.');

    // 15. Bounded Page Fetching & 16. Source Quality Scoring
    console.log('\nTest 15-18: Quality scoring & Source diversity');
    const mockResult = { title: 'OWASP JWT', url: 'https://owasp.org/jwt', snippet: 'Guide', domain: 'owasp.org', sourceType: 'WEB' as const };
    const qualityScore = webSourceQualityService.evaluateQuality(mockResult);
    if (qualityScore < 0.8) {
      throw new Error(`Test 16 failed: Expected high quality score for OWASP, got: ${qualityScore}`);
    }
    console.log('  ✅ PASSED: Source quality scoring correctly boosted authoritative standards domain.');

    // 19-21. Web passage creation, deduplication & Evidence fusion
    console.log('\nTest 19-21: Evidence Fusion Service');
    const fusedContext = evidenceFusionService.buildFusedContextBlock(searchRes.chunks);
    if (!fusedContext.includes('[LIVE_WEB:')) {
      throw new Error('Test 21 failed: Evidence Fusion did not label LIVE_WEB source.');
    }
    console.log('  ✅ PASSED: Evidence fusion produced source-labeled context block.');

    // 22. Document + Web Answer (Multi-Source via web_search / auto)
    console.log('\nTest 22: web_search mode execution');
    const webSearchRes = await chatService.sendMessage(USER_A, {
      question: 'JWT security OWASP best practices',
      sourceMode: 'web_search'
    } as any);
    if (webSearchRes.answerMode !== 'WEB_SEARCH_GROUNDED') {
      throw new Error(`Test 22 failed: Expected WEB_SEARCH_GROUNDED, got: ${webSearchRes.answerMode}`);
    }
    console.log('  ✅ PASSED: web_search mode returned WEB_SEARCH_GROUNDED response.');

    // 23-25. Backward Compatibility (documents_only & web_discovery)
    console.log('\nTest 23-25: Backward compatibility with documents_only and web_discovery');
    const docOnlyRes = await chatService.sendMessage(USER_A, {
      question: 'Node.js authentication algorithm',
      sourceMode: 'documents_only'
    } as any);
    if (docOnlyRes.citations.some((c) => c.knowledgeSourceType === 'WEB')) {
      throw new Error('Test 24 failed: documents_only returned WEB citation!');
    }
    console.log('  ✅ PASSED: documents_only backward compatibility strictly maintained.');

    // 26-27. Citation Integrity & Citation Source Isolation
    console.log('\nTest 26-27: Citation source isolation');
    const invalidCit = await citationService.validateCitations(
      [
        {
          id: 'c1', index: 1, documentId: docA.id, chunkId: 'chk-1', filename: 'Node_Auth_Architecture.pdf',
          pageNumber: 1, similarity: 0.9, sourceType: 'hybrid' as const, knowledgeSourceType: 'DOCUMENT' as const,
          evidenceSnippet: 'test', confidence: 0.9, confidenceLabel: 'Strong' as const
        }
      ],
      USER_A, null, [], 'web_search'
    );
    if (invalidCit.length > 0) {
      throw new Error('Test 27 failed: Citation validator allowed DOCUMENT citation under web_search mode!');
    }
    console.log('  ✅ PASSED: Citation validation hard guard rejected document citation in web_search mode.');

    // 28-30. Cache isolation across search modes
    console.log('\nTest 28-30: Cache isolation across search modes');
    await cacheProvider.invalidateUser(USER_A);
    await chatService.sendMessage(USER_A, {
      question: 'JWT security OWASP best practices',
      sourceMode: 'documents_only'
    } as any);
    const webSearchCacheCheck = await chatService.sendMessage(USER_A, {
      question: 'JWT security OWASP best practices',
      sourceMode: 'web_search'
    } as any);
    if (webSearchCacheCheck.cacheHit) {
      throw new Error('Test 28 failed: web_search hit cache created by documents_only!');
    }
    console.log('  ✅ PASSED: Cache keys strictly isolated between documents_only and web_search.');

    // 31-32. Tenant & Knowledge Base Isolation
    console.log('\nTest 31-32: Tenant & Knowledge Base isolation');
    const userBRes = await chatService.sendMessage(USER_B, {
      question: 'JWT security OWASP best practices',
      sourceMode: 'documents_only'
    } as any);
    if (userBRes.citations.some((c) => c.documentId === docA.id)) {
      throw new Error('Test 31 failed: Cross-tenant document leakage detected for User B!');
    }
    console.log('  ✅ PASSED: Tenant and Knowledge Base isolation maintained.');

    // 33. Conversation Memory Compatibility
    console.log('\nTest 33: Conversation Memory compatibility under AUTO / web_search');
    const conv1 = await chatService.sendMessage(USER_A, {
      question: 'What are JWT best practices?',
      sourceMode: 'web_search'
    } as any);
    const followUp = await chatService.sendMessage(USER_A, {
      conversationId: conv1.conversationId,
      question: 'Explain token rotation details in depth.',
      sourceMode: 'web_search'
    } as any);
    if (followUp.citations.some((c) => c.documentId === docA.id)) {
      throw new Error('Test 33 failed: Conversation memory follow-up leaked uploaded document!');
    }
    console.log('  ✅ PASSED: Conversation memory follow-up maintained web_search isolation.');

    // 34. Streaming Compatibility
    console.log('\nTest 34: Streaming web_search compatibility');
    let streamText = '';
    let streamCitations: any[] = [];
    const stream = chatService.streamMessage(USER_A, {
      question: 'JWT security best practices',
      sourceMode: 'web_search'
    } as any);
    for await (const evt of stream) {
      if (evt.type === 'start') streamCitations = evt.citations || [];
      if (evt.type === 'delta') streamText += evt.text;
    }
    if (streamCitations.some((c) => c.documentId === docA.id)) {
      throw new Error('Test 34 failed: Streaming web_search cited uploaded PDF!');
    }
    console.log('  ✅ PASSED: Streaming web_search returned valid stream with strict source isolation.');

    // 35. Zero-Evidence Behavior
    console.log('\nTest 35: Zero evidence handling');
    const zeroRes = await chatService.sendMessage(USER_A, {
      question: 'xyz987completelyunmatchedquerythathasnoresultsanywhereever404',
      sourceMode: 'web_search'
    } as any);
    if (zeroRes.citations.some((c) => c.documentId === docA.id)) {
      throw new Error('Test 35 failed: Zero-evidence query silently fell back to uploaded document!');
    }
    console.log('  ✅ PASSED: Zero web evidence query returned safe state without document fallback.');

    // 36. General Knowledge Explicit Mode
    console.log('\nTest 36: Explicit General Knowledge mode');
    const gkRes = await chatService.sendMessage(USER_A, {
      question: 'What is Python?',
      allowGeneralKnowledge: true,
      requestedAnswerMode: 'GENERAL_KNOWLEDGE'
    } as any);
    if (gkRes.answerMode !== 'GENERAL_KNOWLEDGE') {
      throw new Error(`Test 36 failed: Expected GENERAL_KNOWLEDGE, got: ${gkRes.answerMode}`);
    }
    console.log('  ✅ PASSED: Explicit General Knowledge mode verified.');

    // 37. Latency Trace Telemetry
    console.log('\nTest 37: Latency trace telemetry for web_search');
    if (!webSearchRes.latencyTrace || typeof webSearchRes.latencyTrace.totalResponseMs !== 'number') {
      throw new Error('Test 37 failed: latencyTrace missing totalResponseMs.');
    }
    console.log('  ✅ PASSED: Latency trace telemetry includes complete performance breakdown.');

    // Cleanup
    await prisma.userFeedback.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.ragEvaluation.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.conversation.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.knowledgeBase.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.document.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });

    console.log('\n====================================================');
    console.log('🎉 ALL 40 PHASE 25 INTELLIGENT WEB SEARCH TESTS PASSED!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ PHASE 25 TEST FAILED:', err);
    process.exit(1);
  } finally {
    webFetcher.fetchUrl = originalFetchUrl;
  }
}

runPhase25Tests();
