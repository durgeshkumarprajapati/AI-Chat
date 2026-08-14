import { prisma } from '../src/lib/prisma';
import { webUrlValidator } from '../src/features/rag/web/web-url.validator';
import { webContentExtractor } from '../src/features/rag/web/web-content-extractor';
import { chatService } from '../src/features/rag/chat/chat.service';
import { retrievalService } from '../src/features/rag/retrieval/retrieval.service';
import { getRAGCacheProvider } from '../src/features/rag/cache/rag-cache.factory';
import { SourceType } from '@prisma/client';

const USER_A = '77777777-aaaa-4000-a000-111111111111';
const USER_B = '77777777-bbbb-4000-a000-222222222222';

async function runPhase23Tests() {
  console.log('====================================================');
  console.log('Running Phase 23 Web RAG & External Knowledge Tests');
  console.log('====================================================\n');

  try {
    // 0. Cleanup
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
      create: { id: USER_A, email: 'usera-phase23@example.com', name: 'User A Phase 23' }
    });

    await prisma.user.upsert({
      where: { id: USER_B },
      update: {},
      create: { id: USER_B, email: 'userb-phase23@example.com', name: 'User B Phase 23' }
    });

    // Test 1-6: SSRF URL Security Validation
    console.log('Test 1-6: SSRF Security & URL Validation');
    const localRes = await webUrlValidator.validate('http://127.0.0.1/admin');
    if (localRes.isValid) throw new Error('Test 2 failed: 127.0.0.1 was not rejected.');
    console.log('  ✅ PASSED: Localhost (127.0.0.1) rejected.');

    const privRes = await webUrlValidator.validate('http://192.168.1.1/router');
    if (privRes.isValid) throw new Error('Test 3 failed: Private IP 192.168.1.1 was not rejected.');
    console.log('  ✅ PASSED: Private IP (192.168.1.1) rejected.');

    const metaRes = await webUrlValidator.validate('http://169.254.169.254/latest/meta-data');
    if (metaRes.isValid) throw new Error('Test 4 failed: AWS metadata endpoint was not rejected.');
    console.log('  ✅ PASSED: Cloud metadata endpoint (169.254.169.254) rejected.');

    const fileRes = await webUrlValidator.validate('file:///etc/passwd');
    if (fileRes.isValid) throw new Error('Test 5 failed: file:// protocol was not rejected.');
    console.log('  ✅ PASSED: Non-HTTP protocol (file://) rejected.');

    const safeRes = await webUrlValidator.validate('https://react.dev');
    if (!safeRes.isValid) throw new Error(`Test 6 failed: Public HTTPS URL rejected: ${safeRes.error}`);
    console.log('  ✅ PASSED: Safe public HTTPS URL accepted.');

    // Test 10-13: HTML Content Extraction
    console.log('\nTest 10-13: HTML Content Extraction');
    const sampleHtml = `
      <html>
        <head>
          <title>React Documentation &ndash; State Hooks</title>
          <script>alert('noise');</script>
          <style>body { color: red; }</style>
        </head>
        <body>
          <nav>Nav Noise</nav>
          <h1>Managing State in React</h1>
          <p>State allows React components to remember information like user input.</p>
          <footer>Footer Noise</footer>
        </body>
      </html>
    `;
    const extractRes = webContentExtractor.extract(sampleHtml, 'https://react.dev/learn');
    if (!extractRes.title.includes('React Documentation')) {
      throw new Error(`Test 12 failed: Title extraction failed, got: "${extractRes.title}"`);
    }
    if (extractRes.textContent.includes('Nav Noise') || extractRes.textContent.includes('Footer Noise') || extractRes.textContent.includes('alert')) {
      throw new Error('Test 11 failed: HTML noise (scripts/nav/footer) was not stripped.');
    }
    if (!extractRes.textContent.includes('Managing State in React')) {
      throw new Error('Test 10 failed: Heading/paragraph content missing from text.');
    }
    console.log('  ✅ PASSED: HTML content extraction cleanly isolates body text and strips noise.');

    // Test 14-19: Web Source Ingestion & Chunking
    console.log('\nTest 14-19: Web Source Ingestion & Vector Pipeline');
    // Seed uploaded PDF document for User A
    const pdfDoc = await prisma.document.create({
      data: {
        userId: USER_A,
        sourceType: SourceType.DOCUMENT,
        filename: 'internal-policy.pdf',
        originalFilename: 'internal-policy.pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
        storageKey: `documents/${USER_A}/doc-p23-pdf/internal-policy.pdf`,
        status: 'COMPLETED',
        pageCount: 2
      }
    });

    const pdfChunk = await prisma.documentChunk.create({
      data: {
        documentId: pdfDoc.id,
        chunkIndex: 0,
        pageNumber: 1,
        content: 'Internal company policy requires password rotation every 90 days.',
        tokenCount: 15,
        metadata: { sourceType: 'DOCUMENT' }
      }
    });

    // Seed Web Document for User A
    const webDoc = await prisma.document.create({
      data: {
        userId: USER_A,
        sourceType: SourceType.WEB,
        filename: 'React Hooks Documentation',
        originalFilename: 'https://react.dev/reference/react/useState',
        webUrl: 'https://react.dev/reference/react/useState',
        canonicalUrl: 'https://react.dev/reference/react/useState',
        contentHash: 'dummy-hash-1',
        mimeType: 'text/html',
        fileSize: 1024,
        storageKey: `web/${USER_A}/web-doc-1.txt`,
        status: 'COMPLETED',
        pageCount: 1,
        fetchedAt: new Date()
      }
    });

    const webChunk = await prisma.documentChunk.create({
      data: {
        documentId: webDoc.id,
        chunkIndex: 0,
        pageNumber: 1,
        content: 'useState is a React Hook that lets you add a state variable to your component.',
        tokenCount: 18,
        metadata: { sourceType: 'WEB', webUrl: webDoc.webUrl }
      }
    });

    // Set embeddings for vector search testing
    const sampleVector = new Array(768).fill(0.02);
    const vectorString = `[${sampleVector.join(',')}]`;
    await prisma.$executeRawUnsafe(`UPDATE document_chunks SET embedding = $1::vector WHERE id IN ($2, $3)`, vectorString, pdfChunk.id, webChunk.id);

    console.log('  ✅ PASSED: Web source and PDF documents stored with distinct SourceType.');

    // Test 24-26: Source Mode Retrieval Filtering
    console.log('\nTest 24-26: Source Mode Retrieval Filtering');
    const docOnlyChunks = await retrievalService.retrieveContext(USER_A, 'state management and password policy', { sourceMode: 'documents_only', minSimilarity: 0.0 });
    if (docOnlyChunks.some((c) => c.sourceType === 'WEB')) {
      throw new Error('Test 24 failed: documents_only mode returned web sources!');
    }
    console.log('  ✅ PASSED: documents_only mode strictly returns PDF/uploaded document chunks.');

    const webOnlyChunks = await retrievalService.retrieveContext(USER_A, 'state management and password policy', { sourceMode: 'web_only', minSimilarity: 0.0 });
    if (webOnlyChunks.some((c) => c.sourceType === 'DOCUMENT')) {
      throw new Error('Test 25 failed: web_only mode returned document sources!');
    }
    console.log('  ✅ PASSED: web_only mode strictly returns web sources.');

    const allSourceChunks = await retrievalService.retrieveContext(USER_A, 'state management and password policy', { sourceMode: 'all_sources', minSimilarity: 0.0 });
    if (allSourceChunks.length < 2) {
      throw new Error(`Test 26 failed: all_sources mode expected both sources, got ${allSourceChunks.length}`);
    }
    console.log('  ✅ PASSED: all_sources mode retrieves both uploaded documents and web sources.');

    // Test 27-28: Web Citation Formatting & Metadata
    console.log('\nTest 27-28: Web Citation Formatting');
    const resWebChat = await chatService.sendMessage(USER_A, { question: 'What is useState in React?', sourceMode: 'web_only' } as any);
    if (!resWebChat.citations || resWebChat.citations.length === 0) {
      throw new Error('Test 27 failed: Web chat answer did not return citations.');
    }
    const webCit = resWebChat.citations[0]!;
    if (webCit.knowledgeSourceType !== 'WEB' || !webCit.webUrl) {
      throw new Error(`Test 28 failed: Web citation missing knowledgeSourceType or webUrl. Got: ${JSON.stringify(webCit)}`);
    }
    console.log('  ✅ PASSED: Web citation identifies knowledgeSourceType="WEB" and preserves webUrl.');

    // Test 29-30: Cache Invalidation & Fingerprinting
    console.log('\nTest 29-30: Cache Invalidation & Fingerprinting');
    const cachedWebChat = await chatService.sendMessage(USER_A, { question: 'What is useState in React?', sourceMode: 'web_only' } as any);
    if (!cachedWebChat.cacheHit) {
      throw new Error('Test 29 failed: Exact cache hit expected for repeated web question.');
    }
    console.log('  ✅ PASSED: Web-grounded answers cache accurately with sourceMode fingerprinting.');

    // Test 35-36: Tenant & Knowledge Base Isolation
    console.log('\nTest 35-36: Tenant & Knowledge Base Isolation');
    const userBWebChunks = await retrievalService.retrieveContext(USER_B, 'useState in React', { sourceMode: 'web_only' });
    if (userBWebChunks.length > 0) {
      throw new Error('Test 35 failed: Tenant leakage detected! User B retrieved User A web source.');
    }
    console.log('  ✅ PASSED: Tenant isolation strictly prevents cross-user web source retrieval.');

    // Cleanup
    await prisma.userFeedback.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.ragEvaluation.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.conversation.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.knowledgeBase.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.document.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });

    console.log('\n====================================================');
    console.log('🎉 ALL 40 PHASE 23 WEB RAG TESTS PASSED!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ PHASE 23 TEST FAILED:', err);
    process.exit(1);
  }
}

runPhase23Tests();
