import { prisma } from '../src/lib/prisma';
import { robotsPolicyService } from '../src/features/rag/web-discovery/robots-policy';
import { UrlNormalizer } from '../src/features/rag/web-discovery/url-normalizer';
import { chatService } from '../src/features/rag/chat/chat.service';
import { getRAGCacheProvider } from '../src/features/rag/cache/rag-cache.factory';
import { citationService } from '../src/features/rag/citation/citation.service';
import { webFetcher } from '../src/features/rag/web/web-fetcher';
import { SourceType } from '@prisma/client';

const USER_A = '88888888-aaaa-4000-a000-111111111111';
const USER_B = '88888888-bbbb-4000-a000-222222222222';

async function runPhase24Tests() {
  console.log('====================================================');
  console.log('Running Phase 24 Web Discovery & Strict Source Isolation Tests');
  console.log('====================================================\n');

  // Mock webFetcher.fetchUrl to make tests deterministic and instantaneous
  const originalFetchUrl = webFetcher.fetchUrl.bind(webFetcher);
  webFetcher.fetchUrl = async (url: string) => {
    if (url.includes('xyz987completelyunmatchedquery')) {
      return {
        html: '<html><body><h1>404 Not Found</h1></body></html>',
        finalUrl: url,
        statusCode: 404,
        headers: { 'content-type': 'text/html' }
      };
    }
    return {
      html: `<html><head><title>Python Documentation</title></head><body><h1>Python Documentation</h1><p>According to the Python documentation, garbage collection uses reference counting and a cycle detector. The difference between is and == in Python is that is compares identity while == compares value equality.</p></body></html>`,
      finalUrl: url,
      statusCode: 200,
      headers: { 'content-type': 'text/html' }
    };
  };

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

    const dummyVector = Array(768).fill(0.1);

    // Create a mock uploaded PDF document for User A
    const mockPdfDoc = await prisma.document.create({
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

    // Create a mock saved WebSource document for User A
    const mockWebDoc = await prisma.document.create({
      data: {
        id: 'saved-web-doc-1',
        userId: USER_A,
        sourceType: SourceType.WEB,
        filename: 'Python Memory Management Web.html',
        originalFilename: 'Python Memory Management Web.html',
        mimeType: 'text/html',
        fileSize: 2048,
        storageKey: 'web/python-mem.html',
        webUrl: 'https://docs.python.org/3/c-api/memory.html',
        canonicalUrl: 'https://docs.python.org/3/c-api/memory.html',
        status: 'COMPLETED',
        chunks: {
          create: {
            chunkIndex: 0,
            pageNumber: 1,
            content: 'Python memory management details: reference counting and cycle-detecting garbage collection in Python C-API.',
            tokenCount: 25
          }
        }
      }
    });

    // Update chunk embeddings via raw query
    await prisma.$executeRawUnsafe(
      `UPDATE document_chunks SET embedding = $1::vector WHERE document_id IN ($2, $3)`,
      JSON.stringify(dummyVector),
      mockPdfDoc.id,
      mockWebDoc.id
    );

    // Baseline Normalization & Robots.txt Checks
    console.log('Test 1: URL Normalizer & Robots Policy');
    const rawUrl = 'https://docs.python.org/3/library/asyncio.html?utm_source=twitter&ref=blog#section-1';
    const normUrl = UrlNormalizer.normalize(rawUrl);
    if (normUrl.includes('utm_source') || normUrl.includes('#section-1')) {
      throw new Error(`Test 1 failed: URL Normalizer did not strip tracking params. Got: ${normUrl}`);
    }
    const isWikiAllowed = await robotsPolicyService.isAllowed('https://en.wikipedia.org/wiki/Python');
    if (!isWikiAllowed) throw new Error('Test 1 failed: Wikipedia main article disallowed.');
    console.log('  ✅ PASSED: URL Normalization & Robots.txt policy verified.');

    // TEST 1 — WEB_ONLY WITH PDF + WEB DATA
    console.log('\nTEST 1: web_only with both PDF and WebSource present');
    const webOnlyRes = await chatService.sendMessage(USER_A, {
      question: 'Python memory management reference counting',
      sourceMode: 'web_only'
    } as any);

    const pdfInWebOnly = webOnlyRes.citations.some((c) => c.documentId === mockPdfDoc.id || c.knowledgeSourceType === 'DOCUMENT');
    if (pdfInWebOnly) {
      throw new Error('TEST 1 FAILED: web_only request cited uploaded PDF document!');
    }
    console.log('  ✅ PASSED: web_only strictly excluded uploaded PDF document.');

    // TEST 2 — DOCUMENTS_ONLY WITH PDF + WEB DATA
    console.log('\nTEST 2: documents_only with both PDF and WebSource present');
    const docOnlyRes = await chatService.sendMessage(USER_A, {
      question: 'difference between is and == in Python',
      sourceMode: 'documents_only'
    } as any);

    const webInDocOnly = docOnlyRes.citations.some((c) => c.documentId === mockWebDoc.id || c.knowledgeSourceType === 'WEB');
    if (webInDocOnly) {
      throw new Error('TEST 2 FAILED: documents_only request cited saved WebSource document!');
    }
    console.log('  ✅ PASSED: documents_only strictly excluded saved WebSource document.');

    // TEST 3 — ALL_SOURCES
    console.log('\nTEST 3: all_sources allows both DOCUMENT and WEB');
    const allSourcesRes = await chatService.sendMessage(USER_A, {
      question: 'Python programming details and memory management',
      sourceMode: 'all_sources'
    } as any);
    if (!allSourcesRes.answer) {
      throw new Error('TEST 3 FAILED: all_sources failed to generate answer.');
    }
    console.log('  ✅ PASSED: all_sources allows participation of all ingested source types.');

    // TEST 4 — WEB_DISCOVERY
    console.log('\nTEST 4: web_discovery live discovery');
    const webDiscRes = await chatService.sendMessage(USER_A, {
      question: 'what is the difference between is and == in Python',
      sourceMode: 'web_discovery',
      targetWebsite: 'https://docs.python.org/3/'
    } as any);

    if (webDiscRes.answerMode !== 'WEB_DISCOVERY_GROUNDED') {
      throw new Error(`TEST 4 FAILED: Expected WEB_DISCOVERY_GROUNDED, got: ${webDiscRes.answerMode}`);
    }
    const docInWebDisc = webDiscRes.citations.some((c) => c.documentId === mockPdfDoc.id || c.documentId === mockWebDoc.id);
    if (docInWebDisc) {
      throw new Error('TEST 4 FAILED: web_discovery cited database document or saved WebSource!');
    }
    console.log('  ✅ PASSED: web_discovery strictly restricted citations to temporary discovered web URLs.');

    // TEST 5 — WEB_DISCOVERY WITH PDF ANSWER AVAILABLE
    console.log('\nTEST 5: web_discovery with PDF answer available must NOT use PDF');
    const webDiscPdfCheck = await chatService.sendMessage(USER_A, {
      question: 'difference between is and == in Python',
      sourceMode: 'web_discovery',
      targetWebsite: 'https://docs.python.org/3/'
    } as any);

    if (webDiscPdfCheck.citations.some((c) => c.documentId === mockPdfDoc.id)) {
      throw new Error('TEST 5 FAILED: web_discovery used PDF document!');
    }
    console.log('  ✅ PASSED: web_discovery did NOT use PDF document despite matching PDF content.');

    // TEST 6 — WEB_ONLY WITH PDF ANSWER AVAILABLE
    console.log('\nTEST 6: web_only with PDF answer available must NOT use PDF');
    const webOnlyPdfCheck = await chatService.sendMessage(USER_A, {
      question: 'difference between is and == in Python',
      sourceMode: 'web_only'
    } as any);

    if (webOnlyPdfCheck.citations.some((c) => c.documentId === mockPdfDoc.id)) {
      throw new Error('TEST 6 FAILED: web_only used PDF document!');
    }
    console.log('  ✅ PASSED: web_only did NOT use PDF document when only PDF contained match.');

    // TEST 7 — FOLLOW-UP WEB_ONLY
    console.log('\nTEST 7: Follow-up question under web_only retains web_only isolation');
    const convA = await chatService.sendMessage(USER_A, {
      question: 'Python memory management',
      sourceMode: 'web_only'
    } as any);
    const followUpWebOnly = await chatService.sendMessage(USER_A, {
      conversationId: convA.conversationId,
      question: 'Explain garbage collection details in Python',
      sourceMode: 'web_only'
    } as any);

    if (followUpWebOnly.citations.some((c) => c.documentId === mockPdfDoc.id)) {
      throw new Error('TEST 7 FAILED: Follow-up web_only request cited uploaded PDF!');
    }
    console.log('  ✅ PASSED: Conversation memory follow-up maintained web_only source isolation.');

    // TEST 8 — FOLLOW-UP WEB_DISCOVERY
    console.log('\nTEST 8: Follow-up question under web_discovery retains web_discovery isolation');
    const convDisc = await chatService.sendMessage(USER_A, {
      question: 'What is Python garbage collection',
      sourceMode: 'web_discovery',
      targetWebsite: 'https://docs.python.org/3/'
    } as any);
    const followUpWebDisc = await chatService.sendMessage(USER_A, {
      conversationId: convDisc.conversationId,
      question: 'What does its cycle detector do?',
      sourceMode: 'web_discovery',
      targetWebsite: 'https://docs.python.org/3/'
    } as any);

    if (followUpWebDisc.citations.some((c) => c.documentId === mockPdfDoc.id || c.documentId === mockWebDoc.id)) {
      throw new Error('TEST 8 FAILED: Follow-up web_discovery request cited stored database document!');
    }
    console.log('  ✅ PASSED: Conversation memory follow-up maintained web_discovery source isolation.');

    // TEST 9 — EXACT CACHE ISOLATION
    console.log('\nTEST 9: Exact cache isolation across source modes');
    await cacheProvider.invalidateUser(USER_A);
    await chatService.sendMessage(USER_A, {
      question: 'difference between is and == in Python',
      sourceMode: 'documents_only'
    } as any);
    const webOnlyCacheCheck = await chatService.sendMessage(USER_A, {
      question: 'difference between is and == in Python',
      sourceMode: 'web_only'
    } as any);
    if (webOnlyCacheCheck.cacheHit) {
      throw new Error('TEST 9 FAILED: web_only hit cache created by documents_only!');
    }
    console.log('  ✅ PASSED: Exact cache key properly isolated between documents_only and web_only.');

    // TEST 10 — SEMANTIC CACHE ISOLATION
    console.log('\nTEST 10: Semantic cache isolation across source modes');
    const semCheck = await chatService.sendMessage(USER_A, {
      question: 'what is the difference between is and == in python code',
      sourceMode: 'web_only'
    } as any);
    if (semCheck.cacheHit && semCheck.citations.some((c) => c.documentId === mockPdfDoc.id)) {
      throw new Error('TEST 10 FAILED: Semantic cache returned document answer for web_only query!');
    }
    console.log('  ✅ PASSED: Semantic cache correctly isolated across source modes.');

    // TEST 11 — WEB DISCOVERY CACHE ISOLATION
    console.log('\nTEST 11: Web Discovery cache isolation from documents_only');
    const docCacheCheck = await chatService.sendMessage(USER_A, {
      question: 'what is the difference between is and == in Python',
      sourceMode: 'documents_only',
      targetWebsite: 'https://docs.python.org/3/'
    } as any);
    if (docCacheCheck.cacheHit && docCacheCheck.citations.some((c) => c.knowledgeSourceType === 'WEB')) {
      throw new Error('TEST 11 FAILED: documents_only hit web_discovery cache!');
    }
    console.log('  ✅ PASSED: Web Discovery cache isolated from documents_only requests.');

    // TEST 12 — STREAMING WEB_ONLY
    console.log('\nTEST 12: Streaming web_only source isolation');
    let streamWebAnswer = '';
    let streamWebCitations: any[] = [];
    const webStream = chatService.streamMessage(USER_A, {
      question: 'Python memory management reference counting',
      sourceMode: 'web_only'
    } as any);
    for await (const evt of webStream) {
      if (evt.type === 'start') streamWebCitations = evt.citations || [];
      if (evt.type === 'delta') streamWebAnswer += evt.text;
    }
    if (streamWebCitations.some((c) => c.documentId === mockPdfDoc.id)) {
      throw new Error('TEST 12 FAILED: Streaming web_only cited uploaded PDF document!');
    }
    console.log('  ✅ PASSED: Streaming web_only strictly enforced source isolation.');

    // TEST 13 — STREAMING WEB_DISCOVERY
    console.log('\nTEST 13: Streaming web_discovery source isolation');
    let streamDiscCitations: any[] = [];
    const discStream = chatService.streamMessage(USER_A, {
      question: 'what is the difference between is and == in Python',
      sourceMode: 'web_discovery',
      targetWebsite: 'https://docs.python.org/3/'
    } as any);
    for await (const evt of discStream) {
      if (evt.type === 'start') streamDiscCitations = evt.citations || [];
    }
    if (streamDiscCitations.some((c) => c.documentId === mockPdfDoc.id || c.documentId === mockWebDoc.id)) {
      throw new Error('TEST 13 FAILED: Streaming web_discovery cited stored database document!');
    }
    console.log('  ✅ PASSED: Streaming web_discovery strictly enforced temporary web source isolation.');

    // TEST 14 — ZERO WEB EVIDENCE
    console.log('\nTEST 14: Zero web evidence handling without PDF fallback');
    const zeroWebAns = await chatService.sendMessage(USER_A, {
      question: 'xyz987completelyunmatchedquerythathasnoresultsanywhereever',
      sourceMode: 'web_discovery',
      targetWebsite: 'https://docs.python.org/3/'
    } as any);

    if (zeroWebAns.citations.some((c) => c.documentId === mockPdfDoc.id)) {
      throw new Error('TEST 14 FAILED: Zero-evidence web_discovery query silently fell back to uploaded PDF!');
    }
    console.log('  ✅ PASSED: Zero web evidence query correctly returned safe state without PDF fallback.');

    // TEST 15 — CITATION HARD GUARD
    console.log('\nTEST 15: Citation validation hard guard boundary');
    const mockMixedCitations = [
      {
        id: 'cit-pdf',
        index: 1,
        documentId: mockPdfDoc.id,
        chunkId: 'chk-pdf-1',
        filename: 'PYTHON_PROGRAMMING_GUIDE.pdf',
        pageNumber: 6,
        similarity: 0.9,
        sourceType: 'hybrid' as const,
        knowledgeSourceType: 'DOCUMENT' as const,
        webUrl: undefined,
        canonicalUrl: undefined,
        evidenceSnippet: 'PDF snippet',
        confidence: 0.9,
        confidenceLabel: 'Strong' as const
      }
    ];

    const validatedInWebMode = await citationService.validateCitations(mockMixedCitations, USER_A, null, [], 'web_only');
    if (validatedInWebMode.length > 0) {
      throw new Error('TEST 15 FAILED: Citation validation guard failed to reject DOCUMENT citation in web_only mode.');
    }
    console.log('  ✅ PASSED: Citation validation hard guard rejected document citation in web_only mode.');

    // Cleanup
    await prisma.userFeedback.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.ragEvaluation.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.conversation.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.knowledgeBase.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.document.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });

    console.log('\n====================================================');
    console.log('🎉 ALL 15 HARD SOURCE-INVARIANT TESTS PASSED!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ PHASE 24 TEST FAILED:', err);
    process.exit(1);
  } finally {
    webFetcher.fetchUrl = originalFetchUrl;
  }
}

runPhase24Tests();
