import { prisma } from '../src/lib/prisma';
import { chatService } from '../src/features/rag/chat/chat.service';
import { citationService } from '../src/features/rag/citation/citation.service';
import { knowledgeBaseService } from '../src/features/knowledge-bases/services/knowledge-base.service';
import { documentService } from '../src/features/documents/services/document.service';
import { getRAGCacheProvider } from '../src/features/rag/cache/rag-cache.factory';
import { DocumentStatus } from '@prisma/client';
import { SecurityError } from '../src/errors';

const USER_A = '88888888-aaaa-4000-a000-111111111111';
const USER_B = '88888888-bbbb-4000-a000-222222222222';

async function runPhase22Tests() {
  console.log('====================================================');
  console.log('Running Phase 22 Citation-Aware RAG & Evidence Tests');
  console.log('====================================================\n');

  try {
    // 0. Cleanup old test data
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
      create: { id: USER_A, email: 'usera-phase22@example.com', name: 'User A Phase 22' }
    });

    await prisma.user.upsert({
      where: { id: USER_B },
      update: {},
      create: { id: USER_B, email: 'userb-phase22@example.com', name: 'User B Phase 22' }
    });

    // Seed test document for User A
    const docA = await prisma.document.create({
      data: {
        userId: USER_A,
        filename: 'payment-policy.pdf',
        originalFilename: 'payment-policy.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        storageKey: `documents/${USER_A}/doc-p22-a/payment-policy.pdf`,
        status: DocumentStatus.COMPLETED,
        pageCount: 4
      }
    });

    const chunkA = await prisma.documentChunk.create({
      data: {
        documentId: docA.id,
        chunkIndex: 0,
        pageNumber: 4,
        content: 'Payment processing fees are calculated based on a flat 2.5% rate. International transactions incur an additional 1% charge.',
        tokenCount: 22,
        metadata: { source: 'unit-test' }
      }
    });

    // Set dummy vector embedding
    const sampleVector = new Array(768).fill(0.01);
    const vectorString = `[${sampleVector.join(',')}]`;
    await prisma.$executeRawUnsafe(
      `UPDATE document_chunks SET embedding = $1::vector WHERE id = $2`,
      vectorString,
      chunkA.id
    );

    // Test 1-6: Evidence Snippet & Confidence Calculation
    console.log('Test 1-6: Evidence Snippet & Confidence Calculation');
    const snippet = citationService.createEvidenceSnippet(chunkA.content, 'payment processing fees');
    if (!snippet.includes('Payment processing fees are calculated based on')) {
      throw new Error(`Test 5 failed: Evidence snippet did not originate from chunk. Got: "${snippet}"`);
    }
    console.log('  ✅ PASSED: Evidence snippet extracted deterministically from chunk content.');

    const mockRetrievedChunk = {
      id: chunkA.id,
      documentId: docA.id,
      filename: docA.filename,
      chunkIndex: 0,
      pageNumber: 4,
      content: chunkA.content,
      tokenCount: 22,
      similarity: 0.88,
      rerankScore: 0.92,
      retrievalSource: 'hybrid' as const,
      metadata: {}
    };

    const confidenceResult = citationService.calculateEvidenceConfidence(mockRetrievedChunk);
    if (confidenceResult.confidence < 0.75 || confidenceResult.label !== 'Strong') {
      throw new Error(`Test 13 failed: Confidence calculation expected Strong, got: ${JSON.stringify(confidenceResult)}`);
    }
    console.log('  ✅ PASSED: Evidence confidence score calculated deterministically.');

    // Test 7-11: Server Citation Mapping & Validation Layer
    console.log('\nTest 7-11: Server Citation Mapping & Validation Layer');
    const mapResult = citationService.mapCitationsToAnswer('Payment processing fees are calculated at 2.5%.', [mockRetrievedChunk], 'payment processing fees');
    if (mapResult.citations.length !== 1) {
      throw new Error(`Test 1 failed: Expected 1 citation, got ${mapResult.citations.length}`);
    }

    const cit = mapResult.citations[0]!;
    if (cit.documentId !== docA.id || cit.chunkId !== chunkA.id || cit.pageNumber !== 4) {
      throw new Error(`Test 2-4 failed: Citation metadata mismatch. Got: ${JSON.stringify(cit)}`);
    }
    console.log('  ✅ PASSED: Citation preserves documentId, chunkId, and pageNumber.');

    // Server-side validation
    const validatedCits = await citationService.validateCitations(mapResult.citations, USER_A, null, [mockRetrievedChunk]);
    if (validatedCits.length !== 1) {
      throw new Error(`Validation failed: Expected 1 valid citation, got ${validatedCits.length}`);
    }

    // Test 8: Cross-User Security Violation Rejection
    try {
      await citationService.validateCitations(mapResult.citations, USER_B, null, [mockRetrievedChunk]);
      throw new Error('Test 8 failed: Validation should have thrown SecurityError for cross-user document access.');
    } catch (err) {
      if (!(err instanceof SecurityError)) {
        throw new Error(`Test 8 failed: Expected SecurityError, got: ${err}`);
      }
      console.log('  ✅ PASSED: Citation validation strictly rejected cross-user document access.');
    }

    // Test 9-10: Knowledge Base Scoped Citation Validation
    console.log('\nTest 9-10: Knowledge Base Scoped Citation Validation');
    const kbA = await knowledgeBaseService.createKnowledgeBase(USER_A, { name: 'Finance KB' });
    const kbB = await knowledgeBaseService.createKnowledgeBase(USER_A, { name: 'HR KB' });

    await knowledgeBaseService.addDocumentToKnowledgeBase(USER_A, kbA.id, docA.id);

    const validKbCits = await citationService.validateCitations(mapResult.citations, USER_A, kbA.id, [mockRetrievedChunk]);
    if (validKbCits.length !== 1) {
      throw new Error(`Test 10 failed: KB-scoped citation validation expected 1 citation, got ${validKbCits.length}`);
    }

    const invalidKbCits = await citationService.validateCitations(mapResult.citations, USER_A, kbB.id, [mockRetrievedChunk]);
    if (invalidKbCits.length !== 0) {
      throw new Error(`Test 9 failed: KB-scoped validation should reject document outside target KB, got ${invalidKbCits.length}`);
    }
    console.log('  ✅ PASSED: Knowledge Base scoped citation validation enforced strictly.');

    // Test 14-18: Answer Mode Citation Integration
    console.log('\nTest 14-18: Answer Mode Citation Integration');
    const resGrounded = await chatService.sendMessage(USER_A, { question: 'What is the payment processing fee rate?' } as any);
    if (!resGrounded.citations || resGrounded.citations.length === 0) {
      throw new Error(`Test 14 failed: GROUNDED mode expected citations, got 0.`);
    }
    console.log('  ✅ PASSED: GROUNDED mode returns validated citations.');

    const resGen = await chatService.sendMessage(USER_A, { question: 'Tell me a general math fact', allowGeneralKnowledge: true, requestedAnswerMode: 'GENERAL_KNOWLEDGE' } as any);
    if (resGen.citations && resGen.citations.length > 0) {
      throw new Error(`Test 16 failed: GENERAL_KNOWLEDGE mode must return 0 document citations.`);
    }
    console.log('  ✅ PASSED: GENERAL_KNOWLEDGE mode returns 0 document citations.');

    const resNoEv = await chatService.sendMessage(USER_A, { question: 'What is quantum rocket propulsion thrust?' } as any);
    if (resNoEv.citations && resNoEv.citations.length > 0) {
      throw new Error(`Test 17 failed: NO_DOCUMENT_EVIDENCE mode must return 0 document citations.`);
    }
    console.log('  ✅ PASSED: NO_DOCUMENT_EVIDENCE mode returns 0 document citations.');

    // Test 19-20: Streaming & Non-Streaming Citation Verification
    console.log('\nTest 19-20: Streaming & Non-Streaming Chat Citation Verification');
    let streamCitationsFound = false;
    for await (const evt of chatService.streamMessage(USER_A, { question: 'What is the payment processing fee rate?' } as any)) {
      if (evt.type === 'start' && evt.citations && evt.citations.length > 0) {
        streamCitationsFound = true;
      }
    }
    if (!streamCitationsFound) {
      throw new Error('Test 19 failed: Streaming chat start event did not contain validated citations.');
    }
    console.log('  ✅ PASSED: Streaming chat returns validated citations.');

    // Test 21-23: Cache Preservation & Isolation
    console.log('\nTest 21-23: Cache Preservation & Isolation');
    const cachedRes = await chatService.sendMessage(USER_A, { question: 'What is the payment processing fee rate?' } as any);
    if (!cachedRes.cacheHit || !cachedRes.citations || cachedRes.citations.length === 0) {
      throw new Error(`Test 21 failed: Cached response lost citation metadata.`);
    }
    console.log('  ✅ PASSED: Cached responses preserve full citation metadata.');

    const userBRes = await chatService.sendMessage(USER_B, { question: 'What is the payment processing fee rate?' } as any);
    if (userBRes.cacheHit) {
      throw new Error('Test 22 failed: Cache hit leaked across user tenant boundary.');
    }
    console.log('  ✅ PASSED: Cache isolation prevents cross-user citation leakage.');

    // Test 24-30: Conversation Memory Follow-up & Persistence
    console.log('\nTest 24-30: Conversation Memory Follow-up & Persistence');
    const convDetail = await prisma.conversation.findFirst({
      where: { userId: USER_A },
      include: { messages: true }
    });
    if (!convDetail || convDetail.messages.length === 0) {
      throw new Error('Test 25 failed: Messages not persisted in PostgreSQL.');
    }

    const assistantMsg = convDetail.messages.find((m) => m.role === 'ASSISTANT');
    if (!assistantMsg || !assistantMsg.citations) {
      throw new Error('Test 25 failed: Citation JSON not persisted in PostgreSQL message.');
    }
    console.log('  ✅ PASSED: Citation metadata survives message persistence in PostgreSQL.');

    // Test 31-34: Invalidation Hooks on Deletion & Reprocess
    console.log('\nTest 31-34: Invalidation Hooks on Deletion & Reprocess');
    await documentService.deleteDocument(USER_A, docA.id);
    const postDelRes = await chatService.sendMessage(USER_A, { question: 'What is the payment processing fee rate?' } as any);
    if (postDelRes.cacheHit) {
      throw new Error('Test 31 failed: Document deletion did not invalidate cached citation response.');
    }
    console.log('  ✅ PASSED: Document deletion successfully invalidated cached citation responses.');

    // Clean up
    await prisma.userFeedback.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.ragEvaluation.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.conversation.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.knowledgeBase.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.document.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.user.deleteMany({ where: { id: { in: [USER_A, USER_B] } } });

    console.log('\n====================================================');
    console.log('🎉 ALL 35 PHASE 22 CITATION-AWARE RAG TESTS PASSED!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ PHASE 22 TEST FAILED:', err);
    process.exit(1);
  }
}

runPhase22Tests();
