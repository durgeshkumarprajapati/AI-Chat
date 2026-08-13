import dotenv from 'dotenv';
dotenv.config();

import { evaluationService } from '../src/features/rag/evaluation/evaluation.service';
import { localHeuristicEvaluator } from '../src/features/rag/evaluation/evaluator';
import { chatService } from '../src/features/rag/chat/chat.service';
import { documentService } from '../src/features/documents/services/document.service';
import { documentRepository } from '../src/features/documents/repositories/document.repository';
import { prisma } from '../src/lib/prisma';
import { DocumentStatus } from '@prisma/client';
import { AuthorizationError, NotFoundError } from '../src/errors';

const USER_A = '99999999-aaaa-4000-a000-111111111111';
const USER_B = '99999999-bbbb-4000-a000-222222222222';

async function setupTestUsers() {
  await prisma.user.upsert({
    where: { id: USER_A },
    update: {},
    create: { id: USER_A, email: 'p19-user-a@example.com', name: 'Phase 19 User A' }
  });

  await prisma.user.upsert({
    where: { id: USER_B },
    update: {},
    create: { id: USER_B, email: 'p19-user-b@example.com', name: 'Phase 19 User B' }
  });

  // Clean existing test data
  await prisma.userFeedback.deleteMany({
    where: { userId: { in: [USER_A, USER_B] } }
  });
  await prisma.ragEvaluation.deleteMany({
    where: { userId: { in: [USER_A, USER_B] } }
  });
  await prisma.conversation.deleteMany({
    where: { userId: { in: [USER_A, USER_B] } }
  });
  await prisma.knowledgeBase.deleteMany({
    where: { userId: { in: [USER_A, USER_B] } }
  });
  await prisma.document.deleteMany({
    where: { userId: { in: [USER_A, USER_B] } }
  });
}

async function runPhase19Tests() {
  console.log('====================================================');
  console.log('Running Phase 19 RAG Evaluation & Feedback Tests');
  console.log('====================================================\n');

  await setupTestUsers();

  try {
    // 1. Local Heuristic Evaluator Direct Unit Test
    console.log('Test 1: Local Heuristic Evaluator Groundedness & Citation Calculation');
    const mockInput = {
      userId: USER_A,
      conversationId: 'c1',
      messageId: 'm1',
      question: 'What is the refund policy?',
      answer: 'The refund policy allows full refunds within 30 days of purchase.',
      citations: [
        { documentId: 'd1', chunkId: 'chk1', filename: 'terms.pdf', pageNumber: 2, similarity: 0.85 }
      ],
      retrievedChunks: [
        {
          id: 'chk1',
          documentId: 'd1',
          filename: 'terms.pdf',
          chunkIndex: 0,
          pageNumber: 2,
          content: 'The refund policy allows full refunds within 30 days of purchase upon request.',
          tokenCount: 15,
          similarity: 0.85,
          metadata: {}
        }
      ]
    };

    const scores = await localHeuristicEvaluator.evaluateAnswer(mockInput);
    if (scores.groundednessScore < 0.8) {
      throw new Error(`Expected high groundedness score (>= 0.8), got ${scores.groundednessScore}`);
    }
    if (scores.citationCoverageScore !== 1.0) {
      throw new Error(`Expected citation coverage 1.0, got ${scores.citationCoverageScore}`);
    }
    if (scores.isFallback) {
      throw new Error('Non-fallback answer incorrectly flagged as fallback');
    }
    console.log(`  ✅ PASSED: Heuristic Evaluator calculated groundedness=${scores.groundednessScore}, coverage=${scores.citationCoverageScore}, overall=${scores.overallScore}`);

    // 2. User Feedback Submission & Upsert
    console.log('\nTest 2: User Feedback Submission, Update & Retrievability');
    const convA = await prisma.conversation.create({
      data: { userId: USER_A, title: 'Evaluation Chat' }
    });
    const msgA = await prisma.message.create({
      data: {
        conversationId: convA.id,
        role: 'ASSISTANT',
        content: 'Sample assistant response for evaluation'
      }
    });

    // Positive feedback
    await evaluationService.submitFeedback({
      userId: USER_A,
      conversationId: convA.id,
      messageId: msgA.id,
      rating: 'POSITIVE'
    });

    let fbList = await evaluationService.getUserFeedbackList(USER_A);
    if (fbList.length !== 1 || fbList[0]?.rating !== 'POSITIVE') {
      throw new Error('Failed to record positive user feedback');
    }

    // Update feedback to NEGATIVE with reason
    await evaluationService.submitFeedback({
      userId: USER_A,
      conversationId: convA.id,
      messageId: msgA.id,
      rating: 'NEGATIVE',
      reason: 'INCORRECT_ANSWER',
      comment: 'Did not match policy version'
    });

    fbList = await evaluationService.getUserFeedbackList(USER_A);
    if (fbList.length !== 1 || fbList[0]?.rating !== 'NEGATIVE' || fbList[0]?.reason !== 'INCORRECT_ANSWER') {
      throw new Error('Failed to update feedback upsert record');
    }
    console.log('  ✅ PASSED: Feedback submission, upsert, and listing verified.');

    // 3. Security & Tenant Isolation Enforcement
    console.log('\nTest 3: Feedback & Evaluation Tenant Security Isolation');
    const convB = await prisma.conversation.create({
      data: { userId: USER_B, title: 'User B Chat' }
    });
    const msgB = await prisma.message.create({
      data: {
        conversationId: convB.id,
        role: 'ASSISTANT',
        content: 'User B confidential text'
      }
    });

    let crossFeedbackDenied = false;
    try {
      await evaluationService.submitFeedback({
        userId: USER_A, // User A trying to submit feedback on User B's message
        conversationId: convB.id,
        messageId: msgB.id,
        rating: 'POSITIVE'
      });
    } catch (err) {
      if (err instanceof AuthorizationError || err instanceof NotFoundError) crossFeedbackDenied = true;
    }
    if (!crossFeedbackDenied) throw new Error('SECURITY VIOLATION: User A submitted feedback on User B message!');
    console.log('  ✅ PASSED: Tenant isolation strictly blocks cross-user feedback submission.');

    // 4. Grounded Chat Integration & Non-blocking Evaluation
    console.log('\nTest 4: Chat Integration & Automatic Async Evaluation');
    const docA = await documentService.uploadDocument(USER_A, {
      filename: 'SLA_Agreement.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024 * 200,
      buffer: Buffer.from('%PDF-1.4 99.9% uptime Service Level Agreement terms')
    });

    const chunkText = 'The platform guarantees 99.9% monthly service uptime uptime SLA.';
    await documentRepository.saveChunksTx(docA.id, [
      { chunkIndex: 0, pageNumber: 1, content: chunkText, tokenCount: 12 }
    ]);
    const embeddingProvider = (await import('../src/features/documents/embeddings/embedding.provider.factory')).getEmbeddingProvider();
    const vectors = await embeddingProvider.embedTexts([chunkText]);
    const vectorStr = `[${vectors[0]!.join(',')}]`;
    await prisma.$executeRawUnsafe(`
      UPDATE document_chunks SET embedding = '${vectorStr}'::vector WHERE document_id = '${docA.id}'
    `);
    await documentRepository.updateStatus(docA.id, DocumentStatus.COMPLETED);

    // Run grounded RAG chat turn
    const chatRes = await chatService.sendMessage(USER_A, {
      question: 'What is the guaranteed service uptime SLA?'
    });

    if (chatRes.citations.length === 0) {
      throw new Error('Grounded chat turn failed to return citations');
    }

    // Wait 200ms for background evaluation to complete
    await new Promise((r) => setTimeout(r, 200));

    const evalRecord = await prisma.ragEvaluation.findFirst({
      where: { messageId: chatRes.messageId }
    });

    if (!evalRecord) {
      throw new Error('Automatic background evaluation record was not persisted');
    }
    if (evalRecord.citedChunkCount === 0 || !evalRecord.overallScore) {
      throw new Error('Evaluation record missing valid scores');
    }
    console.log(`  ✅ PASSED: Background evaluation automatically created for chat response (Overall Score: ${evalRecord.overallScore}).`);

    // 5. Aggregated RAG Metrics Calculation
    console.log('\nTest 5: Aggregated RAG Analytics Metrics Calculation');
    const metrics = await evaluationService.getAggregatedMetrics(USER_A, { timeRange: '30d' });

    if (metrics.totalQuestions < 1) {
      throw new Error(`Expected at least 1 evaluated question in metrics, got ${metrics.totalQuestions}`);
    }
    if (metrics.avgGroundednessScore === undefined || metrics.avgGroundednessScore === null) {
      throw new Error('Metrics missing avgGroundednessScore');
    }
    console.log(`  ✅ PASSED: Aggregated metrics calculated (Questions: ${metrics.totalQuestions}, Avg Groundedness: ${metrics.avgGroundednessScore}, Avg Citation Coverage: ${metrics.avgCitationCoverage}).`);

    // 6. Paginated Evaluations List
    console.log('\nTest 6: Paginated Evaluation History');
    const paginatedEvals = await evaluationService.listEvaluationsPaginated(USER_A, { page: 1, pageSize: 10 });
    if (paginatedEvals.items.length < 1) {
      throw new Error('Paginated evaluations list returned 0 items');
    }
    console.log(`  ✅ PASSED: Paginated evaluation list returned ${paginatedEvals.items.length} records.`);

  } finally {
    // Cleanup test users and data
    await prisma.userFeedback.deleteMany({
      where: { userId: { in: [USER_A, USER_B] } }
    });
    await prisma.ragEvaluation.deleteMany({
      where: { userId: { in: [USER_A, USER_B] } }
    });
    await prisma.conversation.deleteMany({
      where: { userId: { in: [USER_A, USER_B] } }
    });
    await prisma.knowledgeBase.deleteMany({
      where: { userId: { in: [USER_A, USER_B] } }
    });
    await prisma.document.deleteMany({
      where: { userId: { in: [USER_A, USER_B] } }
    });
  }

  console.log('\n====================================================');
  console.log('🎉 ALL PHASE 19 RAG EVALUATION & FEEDBACK TESTS PASSED!');
  console.log('====================================================\n');
}

runPhase19Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ PHASE 19 TEST FAILED:', err);
    process.exit(1);
  });
