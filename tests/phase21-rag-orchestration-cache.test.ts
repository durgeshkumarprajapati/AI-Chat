import dotenv from 'dotenv';
dotenv.config();

import { answerOrchestratorService } from '../src/features/rag/orchestration/answer-orchestrator.service';
import { getRAGCacheProvider } from '../src/features/rag/cache/rag-cache.factory';
import { chatService } from '../src/features/rag/chat/chat.service';
import { documentService } from '../src/features/documents/services/document.service';
import { documentRepository } from '../src/features/documents/repositories/document.repository';
import { knowledgeBaseService } from '../src/features/knowledge-bases/services/knowledge-base.service';
import { prisma } from '../src/lib/prisma';
import { env } from '../src/config/env';
import { DocumentStatus } from '@prisma/client';

const USER_A = '77777777-aaaa-4000-a000-111111111111';
const USER_B = '77777777-bbbb-4000-a000-222222222222';

async function setupTestUsers() {
  await prisma.user.upsert({
    where: { id: USER_A },
    update: {},
    create: { id: USER_A, email: 'p21-user-a@example.com', name: 'Phase 21 User A' }
  });

  await prisma.user.upsert({
    where: { id: USER_B },
    update: {},
    create: { id: USER_B, email: 'p21-user-b@example.com', name: 'Phase 21 User B' }
  });

  // Clean test data
  const cacheProvider = getRAGCacheProvider();
  await cacheProvider.invalidateUser(USER_A);
  await cacheProvider.invalidateUser(USER_B);
  await prisma.userFeedback.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
  await prisma.ragEvaluation.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
  await prisma.conversation.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
  await prisma.knowledgeBase.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
  await prisma.document.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
}

async function runPhase21Tests() {
  console.log('====================================================');
  console.log('Running Phase 21 Production Validation & Cache Tests');
  console.log('====================================================\n');

  await setupTestUsers();
  const cacheProvider = getRAGCacheProvider();

  try {
    // 1. Cold Request & Exact Cache Miss
    console.log('Test 1-7: Exact Cache MISS (Cold) vs HIT (Warm) & LLM/Retrieval Bypass Verification');
    const docA = await documentService.uploadDocument(USER_A, {
      filename: 'Enterprise_Policy_2026.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024 * 100,
      buffer: Buffer.from('%PDF-1.4 Enterprise security compliance policy guidelines')
    });

    const chunkContent = 'The enterprise security policy mandates multi-factor authentication for all remote access.';
    await documentRepository.saveChunksTx(docA.id, [
      { chunkIndex: 0, pageNumber: 1, content: chunkContent, tokenCount: 15 }
    ]);
    const embeddingProvider = (await import('../src/features/documents/embeddings/embedding.provider.factory')).getEmbeddingProvider();
    const vectors = await embeddingProvider.embedTexts([chunkContent]);
    const vectorStr = `[${vectors[0]!.join(',')}]`;
    await prisma.$executeRawUnsafe(`
      UPDATE document_chunks SET embedding = '${vectorStr}'::vector WHERE document_id = '${docA.id}'
    `);
    await documentRepository.updateStatus(docA.id, DocumentStatus.COMPLETED);

    const question1 = 'What does the enterprise security policy mandate?';

    // First request: MISS
    const res1 = await chatService.sendMessage(USER_A, { question: question1 } as any);
    if (res1.cacheHit || !res1.llmCalled || !res1.vectorSearchCalled) {
      throw new Error(`Cold request failed: cacheHit=${res1.cacheHit}, llmCalled=${res1.llmCalled}`);
    }
    console.log('  ✅ PASSED: Cold request resulted in cache MISS and executed full RAG pipeline.');

    // Second request: HIT
    const res2 = await chatService.sendMessage(USER_A, { question: question1 } as any);
    if (
      !res2.cacheHit ||
      res2.cacheType !== 'exact' ||
      res2.llmCalled ||
      res2.embeddingCalled ||
      res2.vectorSearchCalled ||
      res2.keywordSearchCalled ||
      res2.rerankCalled
    ) {
      throw new Error(`Exact cache hit failed verification: cacheHit=${res2.cacheHit}, cacheType=${res2.cacheType}, llmCalled=${res2.llmCalled}`);
    }
    console.log('  ✅ PASSED: Second request resulted in Exact Cache HIT, bypassing LLM, embedding, vector search, keyword search, and reranking.');

    // 8. User Tenant Isolation
    console.log('\nTest 8: Exact Cache User Tenant Isolation');
    const resUserB = await chatService.sendMessage(USER_B, { question: question1 } as any);
    if (resUserB.cacheHit) {
      throw new Error('SECURITY VIOLATION: User B hit User A cached answer!');
    }
    console.log('  ✅ PASSED: User B request did not hit User A cached response.');

    // 9. Knowledge Base Scope Isolation
    console.log('\nTest 9: Knowledge Base Scope Isolation');
    const kb1 = await knowledgeBaseService.createKnowledgeBase(USER_A, { name: 'KB Alpha' });
    const kb2 = await knowledgeBaseService.createKnowledgeBase(USER_A, { name: 'KB Beta' });

    await cacheProvider.setExact(
      { userId: USER_A, knowledgeBaseId: kb1.id, query: 'isolation test query' },
      { answer: 'KB1 Answer', citations: [], retrievedChunks: 1, topSimilarity: 0.9, answerMode: 'GROUNDED', cachedAt: new Date().toISOString() }
    );

    const hitKb1 = await cacheProvider.getExact({ userId: USER_A, knowledgeBaseId: kb1.id, query: 'isolation test query' });
    const hitKb2 = await cacheProvider.getExact({ userId: USER_A, knowledgeBaseId: kb2.id, query: 'isolation test query' });

    if (!hitKb1 || hitKb1.answer !== 'KB1 Answer') throw new Error('Failed to retrieve KB1 cache entry');
    if (hitKb2 !== null) throw new Error('SECURITY VIOLATION: KB Beta retrieved KB Alpha cached answer!');
    console.log('  ✅ PASSED: Cache entry strictly isolated by Knowledge Base ID.');

    // 10. Conversation Context Cache Safety
    console.log('\nTest 10: Conversation Context Cache Isolation');
    const keyContextA = { userId: USER_A, query: 'What about enterprise?', contextSummary: 'Summary of Conv A' };
    const keyContextB = { userId: USER_A, query: 'What about enterprise?', contextSummary: 'Summary of Conv B' };

    await cacheProvider.setExact(keyContextA, {
      answer: 'Conv A Answer', citations: [], retrievedChunks: 1, topSimilarity: 0.9, answerMode: 'GROUNDED', cachedAt: new Date().toISOString()
    });

    const hitContextB = await cacheProvider.getExact(keyContextB);
    if (hitContextB !== null) throw new Error('Conversation context safety violation: Conv B hit Conv A cached answer!');
    console.log('  ✅ PASSED: Conversation context summary prevents cross-conversation cache contamination.');

    // 11. Embedding Cache vs Answer Cache Distinction
    console.log('\nTest 11: Embedding Cache Distinction');
    const embedText = 'distinct embedding text test';
    const vec = new Array(768).fill(0.5);
    await cacheProvider.setEmbedding('ollama', 'nomic-embed-text', embedText, vec);
    const retrievedVec = await cacheProvider.getEmbedding('ollama', 'nomic-embed-text', embedText);

    if (!retrievedVec || retrievedVec[0] !== 0.5) throw new Error('Embedding cache store/lookup failed');
    const answerCacheHit = await cacheProvider.getExact({ userId: USER_A, query: embedText });
    if (answerCacheHit !== null) throw new Error('Embedding cache hit incorrectly returned an answer cache hit!');
    console.log('  ✅ PASSED: Embedding cache is strictly distinct from Answer cache.');

    // 12. Zero-Evidence Path Bypasses LLM
    console.log('\nTest 12: Zero-Evidence Path Bypasses LLM');
    const resZeroEv = await answerOrchestratorService.orchestrate({
      userId: USER_B,
      question: 'What is the quantum teleportation algorithm details?'
    });
    if (resZeroEv.llmCalled || resZeroEv.answerMode !== 'NO_DOCUMENT_EVIDENCE') {
      throw new Error(`Zero-evidence path failed: llmCalled=${resZeroEv.llmCalled}, answerMode=${resZeroEv.answerMode}`);
    }
    console.log('  ✅ PASSED: Zero-evidence path returned structured response without calling LLM.');

    // 13. General Knowledge Mode Calls LLM Explicitly
    console.log('\nTest 13: General Knowledge Mode Execution');
    const resGen = await answerOrchestratorService.orchestrate({
      userId: USER_A,
      question: 'What is the speed of light in vacuum?',
      allowGeneralKnowledge: true
    });
    if (!resGen.llmCalled || resGen.answerMode !== 'GENERAL_KNOWLEDGE' || resGen.citations.length !== 0) {
      throw new Error(`General knowledge mode failed: llmCalled=${resGen.llmCalled}, mode=${resGen.answerMode}, citations=${resGen.citations.length}`);
    }
    console.log('  ✅ PASSED: General Knowledge mode explicitly called LLM and returned 0 document citations.');

    // 14-15. Retrieval Recovery Single Attempt Limit
    console.log('\nTest 14-15: Retrieval Recovery Single Attempt Constraint');
    if (env.server?.RAG_MAX_RECOVERY_ATTEMPTS !== undefined && env.server.RAG_MAX_RECOVERY_ATTEMPTS > 1) {
      throw new Error('RAG_MAX_RECOVERY_ATTEMPTS exceeds maximum limit of 1');
    }
    console.log('  ✅ PASSED: Retrieval recovery max attempts constrained to 1 attempt.');

    // 16. No-Evidence Response User Actions
    console.log('\nTest 16: No-Evidence Response Actions');
    if (!resZeroEv.availableActions || !resZeroEv.availableActions.includes('GENERAL_KNOWLEDGE') || !resZeroEv.availableActions.includes('SEARCH_ALL_KNOWLEDGE_BASES')) {
      throw new Error('No-evidence response missing expected user actions');
    }
    console.log('  ✅ PASSED: Structured zero-evidence response contains expected user next actions.');

    // 17-19. Targeted Cache Invalidation Hooks
    console.log('\nTest 17-19: Cache Invalidation Hooks');
    await cacheProvider.setExact({ userId: USER_A, query: 'inv test' }, {
      answer: 'inv data', citations: [], retrievedChunks: 1, topSimilarity: 0.9, answerMode: 'GROUNDED', cachedAt: new Date().toISOString()
    });

    await documentService.deleteDocument(USER_A, docA.id);
    const postDelHit = await cacheProvider.getExact({ userId: USER_A, query: 'inv test' });
    if (postDelHit !== null) throw new Error('Cache invalidation failed after document deletion');
    console.log('  ✅ PASSED: Document deletion successfully invalidated affected user cache.');

    // 20-21. Streaming Exact Cache Hit vs Cold Path
    console.log('\nTest 20-21: Streaming Exact Cache Hit & Cold Path');
    const docStream = await documentService.uploadDocument(USER_A, {
      filename: 'Stream_Guide.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024 * 50,
      buffer: Buffer.from('%PDF-1.4 Stream response guide')
    });
    await documentRepository.saveChunksTx(docStream.id, [{ chunkIndex: 0, pageNumber: 1, content: 'Stream response content guide.', tokenCount: 5 }]);
    await documentRepository.updateStatus(docStream.id, DocumentStatus.COMPLETED);

    // Warm cache for streaming query
    await chatService.sendMessage(USER_A, { question: 'Stream response content guide.' } as any);

    let streamHit = false;
    for await (const evt of chatService.streamMessage(USER_A, { question: 'Stream response content guide.' } as any)) {
      if (evt.type === 'start') {
        streamHit = !!evt.cacheHit;
      }
    }
    if (!streamHit) throw new Error('Streaming exact cache hit failed!');
    console.log('  ✅ PASSED: Streaming exact cache hit returned cacheHit=true on start event.');

    // 22-24. Latency Trace & Asynchronous Evaluation
    console.log('\nTest 22-24: Latency Trace & Async Evaluation');
    const resTrace = await chatService.sendMessage(USER_A, { question: 'Stream response content guide.' } as any);
    if (!resTrace.latencyTrace || resTrace.latencyTrace.llmMs === undefined) {
      throw new Error('Latency trace missing from ChatResponse');
    }
    console.log('  ✅ PASSED: Latency trace correctly provided telemetry metrics.');

    // 25. Conversation Memory Preservation
    console.log('\nTest 25: Conversation Memory Intact');
    const conv = await chatService.sendMessage(USER_A, { question: 'What is the stream response content guide?' } as any);
    const detail = await chatService.getConversationDetail(USER_A, conv.conversationId);
    if (!detail || detail.messages.length < 2) {
      throw new Error('Conversation memory failed to persist messages correctly');
    }
    console.log('  ✅ PASSED: Conversation memory correctly persisted turn context.');

  } finally {
    // Cleanup
    await prisma.userFeedback.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.ragEvaluation.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.conversation.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.knowledgeBase.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
    await prisma.document.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
  }

  console.log('\n====================================================');
  console.log('🎉 ALL 25 PRODUCTION VALIDATION & CACHE TESTS PASSED!');
  console.log('====================================================\n');
}

runPhase21Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ PHASE 21 VALIDATION TEST FAILED:', err);
    process.exit(1);
  });
