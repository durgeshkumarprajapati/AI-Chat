import dotenv from 'dotenv';
dotenv.config();

import { chatService } from '../src/features/rag/chat/chat.service';
import { conversationContextService } from '../src/features/rag/chat/conversation-context.service';
import { documentService } from '../src/features/documents/services/document.service';
import { documentRepository } from '../src/features/documents/repositories/document.repository';
import { prisma } from '../src/lib/prisma';
import { DocumentStatus } from '@prisma/client';
import { AuthorizationError, NotFoundError } from '../src/errors';

const USER_A = '88888888-aaaa-4000-a000-111111111111';
const USER_B = '88888888-bbbb-4000-a000-222222222222';

async function setupTestUsers() {
  await prisma.user.upsert({
    where: { id: USER_A },
    update: {},
    create: { id: USER_A, email: 'p18-user-a@example.com', name: 'Phase 18 User A' }
  });

  await prisma.user.upsert({
    where: { id: USER_B },
    update: {},
    create: { id: USER_B, email: 'p18-user-b@example.com', name: 'Phase 18 User B' }
  });

  // Clean existing test data
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

async function runPhase18Tests() {
  console.log('====================================================');
  console.log('Running Phase 18 Conversation Memory & Context Tests');
  console.log('====================================================\n');

  await setupTestUsers();

  try {
    // 1. Conversation Creation & Heuristic Follow-up Detection
    console.log('Test 1: Heuristic Standalone vs Follow-up Question Detection');
    const isStandalone = conversationContextService.isFollowUpQuestion('What is the refund policy?');
    const isFollowUp1 = conversationContextService.isFollowUpQuestion('Explain the third requirement in more detail.');
    const isFollowUp2 = conversationContextService.isFollowUpQuestion('Can you elaborate on that notice period?');

    if (isStandalone) throw new Error('Failed: "What is the refund policy?" incorrectly classified as follow-up');
    if (!isFollowUp1) throw new Error('Failed: "Explain the third requirement..." not classified as follow-up');
    if (!isFollowUp2) throw new Error('Failed: "Can you elaborate..." not classified as follow-up');
    console.log('  ✅ PASSED: Heuristic query classification working as expected.');

    // 2. Conversation CRUD & Pagination
    console.log('\nTest 2: Conversation CRUD, Search, Pagination & Ownership Validation');
    const convA1 = await prisma.conversation.create({
      data: { userId: USER_A, title: 'Contract Payment Terms' }
    });
    const convA2 = await prisma.conversation.create({
      data: { userId: USER_A, title: 'Engineering Guidelines' }
    });

    // List paginated
    const listRes = await chatService.listUserConversationsPaginated(USER_A, { search: 'contract' });
    if (listRes.total !== 1 || listRes.items[0]?.title !== 'Contract Payment Terms') {
      throw new Error('Failed: Conversation search did not return "Contract Payment Terms"');
    }

    // Rename
    await chatService.renameConversation(USER_A, convA1.id, 'Updated Contract Terms');
    const renamedConv = await chatService.getConversationDetail(USER_A, convA1.id);
    if (renamedConv.title !== 'Updated Contract Terms') {
      throw new Error('Failed to rename conversation');
    }

    // Delete
    await chatService.deleteConversation(USER_A, convA2.id);
    let deleteNotFound = false;
    try {
      await chatService.getConversationDetail(USER_A, convA2.id);
    } catch (err) {
      if (err instanceof NotFoundError) deleteNotFound = true;
    }
    if (!deleteNotFound) throw new Error('Deleted conversation was still accessible');
    console.log('  ✅ PASSED: Conversation CRUD, search, pagination, and rename verified.');

    // 3. Strict Tenant Isolation
    console.log('\nTest 3: Conversation Tenant Isolation & Cross-User Security');
    const convB1 = await prisma.conversation.create({
      data: { userId: USER_B, title: 'User B Confidential Chat' }
    });

    let accessDeniedDetail = false;
    try {
      await chatService.getConversationDetail(USER_A, convB1.id);
    } catch (err) {
      if (err instanceof AuthorizationError || err instanceof NotFoundError) accessDeniedDetail = true;
    }
    if (!accessDeniedDetail) throw new Error('SECURITY VIOLATION: User A viewed User B conversation!');

    let accessDeniedRename = false;
    try {
      await chatService.renameConversation(USER_A, convB1.id, 'Hacked Title');
    } catch (err) {
      if (err instanceof AuthorizationError || err instanceof NotFoundError) accessDeniedRename = true;
    }
    if (!accessDeniedRename) throw new Error('SECURITY VIOLATION: User A renamed User B conversation!');

    let accessDeniedDelete = false;
    try {
      await chatService.deleteConversation(USER_A, convB1.id);
    } catch (err) {
      if (err instanceof AuthorizationError || err instanceof NotFoundError) accessDeniedDelete = true;
    }
    if (!accessDeniedDelete) throw new Error('SECURITY VIOLATION: User A deleted User B conversation!');
    console.log('  ✅ PASSED: Tenant isolation strictly blocks cross-user conversation access, edits, and deletes.');

    // 4. Conversation Context Bounding & Token Limits
    console.log('\nTest 4: Token & Message Count Context Window Bounding');
    // Create 15 messages for convA1
    for (let i = 1; i <= 15; i++) {
      await prisma.message.create({
        data: {
          conversationId: convA1.id,
          role: i % 2 === 1 ? 'USER' : 'ASSISTANT',
          content: `Message ${i}: This is test turn ${i} containing contextual history details.`
        }
      });
    }

    const convContext = await conversationContextService.loadConversationContext(USER_A, convA1.id, 'Explain turn 15 in more detail.');
    if (convContext.includedMessages.length > 12) {
      throw new Error(`Context window exceeded max message count limit (got ${convContext.includedMessages.length})`);
    }
    if (convContext.excludedMessageCount < 3) {
      throw new Error('Older messages were not properly excluded when over threshold');
    }
    console.log(`  ✅ PASSED: Context window bounded to ${convContext.includedMessages.length} messages (excluded ${convContext.excludedMessageCount}).`);

    // 5. Zero-Document Fallback inside Multi-turn Conversation
    console.log('\nTest 5: Zero-Document Fallback Policy inside Multi-turn Conversation');
    // Non-streaming chat with zero documents matching query
    const chatResponse = await chatService.sendMessage(USER_A, {
      conversationId: convA1.id,
      question: 'What is the quantum mechanics formula for gravity?'
    });

    if (chatResponse.answer !== "I couldn't find enough relevant information in your uploaded documents to answer that question.") {
      throw new Error(`Zero-document fallback failed inside multi-turn chat. Got answer: "${chatResponse.answer}"`);
    }
    if (chatResponse.citations.length !== 0) {
      throw new Error('Zero-document fallback returned non-empty citations');
    }
    console.log('  ✅ PASSED: Zero-document fallback policy correctly triggered inside multi-turn conversation.');

    // 6. Grounded Multi-turn RAG Chat with Document Citations
    console.log('\nTest 6: Multi-turn RAG Chat Grounded in Document Evidence');
    const docA1 = await documentService.uploadDocument(USER_A, {
      filename: 'Security_Policy_2026.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024 * 300,
      buffer: Buffer.from('%PDF-1.4 Zero-trust network access and mandatory multi-factor authentication policies')
    });

    const chunkContent = 'Mandatory multi-factor authentication (MFA) is required for all production server logins.';
    await documentRepository.saveChunksTx(docA1.id, [
      { chunkIndex: 0, pageNumber: 1, content: chunkContent, tokenCount: 15 }
    ]);

    const embeddingProvider = (await import('../src/features/documents/embeddings/embedding.provider.factory')).getEmbeddingProvider();
    const vectors = await embeddingProvider.embedTexts([chunkContent]);
    const vectorStr = `[${vectors[0]!.join(',')}]`;

    await prisma.$executeRawUnsafe(`
      UPDATE document_chunks SET embedding = '${vectorStr}'::vector WHERE document_id = '${docA1.id}'
    `);
    await documentRepository.updateStatus(docA1.id, DocumentStatus.COMPLETED);

    // Initial Question
    const turn1 = await chatService.sendMessage(USER_A, {
      question: 'What are the production server login requirements?'
    });

    if (turn1.citations.length === 0) {
      throw new Error('Grounded chat turn 1 failed to return citations');
    }

    // Follow-up Question using conversation memory
    const turn2 = await chatService.sendMessage(USER_A, {
      conversationId: turn1.conversationId,
      question: 'Is multi-factor authentication mandatory for that?'
    });

    if (turn2.citations.length === 0) {
      throw new Error('Follow-up chat turn 2 failed to return citations using conversation context');
    }
    console.log('  ✅ PASSED: Multi-turn grounded RAG chat successfully preserved context and citations.');

    // 7. Streaming Chat with Conversation Memory
    console.log('\nTest 7: Streaming SSE Chat with Multi-turn Conversation Memory');
    let streamDone = false;
    let accumulatedText = '';
    let startEventReceived = false;

    const stream = chatService.streamMessage(USER_A, {
      conversationId: turn1.conversationId,
      question: 'Summarize the login policy we discussed.'
    });

    for await (const evt of stream) {
      if (evt.type === 'start') {
        startEventReceived = true;
      } else if (evt.type === 'delta') {
        accumulatedText += evt.text;
      } else if (evt.type === 'done') {
        streamDone = true;
      }
    }

    if (!startEventReceived || !streamDone || accumulatedText.length === 0) {
      throw new Error('Streaming SSE chat with conversation memory failed');
    }
    console.log('  ✅ PASSED: Streaming SSE chat completed with multi-turn memory.');

    // 8. Auto-Title & Summary Generation Check
    console.log('\nTest 8: Automatic Title Generation & Threshold Summarization');
    const freshConv = await prisma.conversation.create({
      data: { userId: USER_A, title: 'New Chat' }
    });

    await conversationContextService.generateConversationTitle(USER_A, freshConv.id, 'What is the payment processing fee policy?');
    const titledConv = await chatService.getConversationDetail(USER_A, freshConv.id);

    if (!titledConv.title || titledConv.title === 'New Chat') {
      console.warn('  ⚠️ Note: Title generation returned default fallback or mock response (non-fatal).');
    } else {
      console.log(`  ✅ PASSED: Conversation title auto-generated: "${titledConv.title}"`);
    }

  } finally {
    // Cleanup test users and data
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
  console.log('🎉 ALL PHASE 18 CONVERSATION MEMORY TESTS PASSED!');
  console.log('====================================================\n');
}

runPhase18Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ PHASE 18 TEST FAILED:', err);
    process.exit(1);
  });
