import dotenv from 'dotenv';
dotenv.config();

import { knowledgeBaseService } from '../src/features/knowledge-bases/services/knowledge-base.service';
import { knowledgeBaseRepository } from '../src/features/knowledge-bases/repositories/knowledge-base.repository';
import { documentService } from '../src/features/documents/services/document.service';
import { documentRepository } from '../src/features/documents/repositories/document.repository';
import { retrievalService } from '../src/features/rag/retrieval/retrieval.service';
import { chatService } from '../src/features/rag/chat/chat.service';
import { storage } from '../src/lib/storage';
import { prisma } from '../src/lib/prisma';
import { DocumentStatus } from '@prisma/client';
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from '../src/errors';

const USER_A = '98765432-aaaa-4000-a000-111111111111';
const USER_B = '98765432-bbbb-4000-a000-222222222222';

async function setupTestUsers() {
  await prisma.user.upsert({
    where: { id: USER_A },
    update: {},
    create: { id: USER_A, email: 'p17-user-a@example.com', name: 'Phase 17 User A' }
  });

  await prisma.user.upsert({
    where: { id: USER_B },
    update: {},
    create: { id: USER_B, email: 'p17-user-b@example.com', name: 'Phase 17 User B' }
  });

  // Clean existing test data
  await prisma.knowledgeBase.deleteMany({
    where: { userId: { in: [USER_A, USER_B] } }
  });
  await prisma.document.deleteMany({
    where: { userId: { in: [USER_A, USER_B] } }
  });
}

async function runPhase17Tests() {
  console.log('====================================================');
  console.log('Running Phase 17 Knowledge Bases & Scoped RAG Tests');
  console.log('====================================================\n');

  await setupTestUsers();

  try {
    // 1. Create Knowledge Base & Validation Tests
    console.log('Test 1: Knowledge Base Creation & Input Validation');
    const kbA1 = await knowledgeBaseService.createKnowledgeBase(USER_A, {
      name: 'Engineering Specs',
      description: 'System architecture and API guidelines'
    });

    if (!kbA1.id || kbA1.name !== 'Engineering Specs') {
      throw new Error('Failed to create Knowledge Base for User A');
    }

    // Reject empty name
    let emptyNameError = false;
    try {
      await knowledgeBaseService.createKnowledgeBase(USER_A, { name: '   ' });
    } catch (err) {
      if (err instanceof ValidationError) emptyNameError = true;
    }
    if (!emptyNameError) throw new Error('Failed to reject empty KB name');

    // Reject oversized name (>100 chars)
    let oversizedNameError = false;
    try {
      await knowledgeBaseService.createKnowledgeBase(USER_A, { name: 'A'.repeat(105) });
    } catch (err) {
      if (err instanceof ValidationError) oversizedNameError = true;
    }
    if (!oversizedNameError) throw new Error('Failed to reject oversized KB name');

    console.log('  ✅ PASSED: KB creation and name/description validations verified.');

    // 2. KB Listing, Pagination, Search & Update
    console.log('\nTest 2: KB Listing, Search, Pagination & Update');
    await knowledgeBaseService.createKnowledgeBase(USER_A, {
      name: 'HR Policies',
      description: 'Employee handbook and benefits'
    });

    const paginatedKbs = await knowledgeBaseService.listKnowledgeBasesPaginated(USER_A, {
      search: 'engineering'
    });
    if (paginatedKbs.total !== 1 || paginatedKbs.items[0]?.name !== 'Engineering Specs') {
      throw new Error('Search failed to find "Engineering Specs"');
    }

    const updatedKb = await knowledgeBaseService.updateKnowledgeBase(USER_A, kbA1.id, {
      name: 'Core Engineering Docs',
      description: 'Updated architecture documentation'
    });
    if (updatedKb.name !== 'Core Engineering Docs') {
      throw new Error('Failed to update Knowledge Base name');
    }
    console.log('  ✅ PASSED: KB search, pagination, and name updates working correctly.');

    // 3. Document Association & Duplicate Prevention
    console.log('\nTest 3: Document Membership & Duplicate Addition Prevention');
    const docA1 = await documentService.uploadDocument(USER_A, {
      filename: 'Architecture_2026.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024 * 500,
      buffer: Buffer.from('%PDF-1.4 Microservices Architecture and pgvector details')
    });

    const docA2 = await documentService.uploadDocument(USER_A, {
      filename: 'HR_Handbook.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024 * 200,
      buffer: Buffer.from('%PDF-1.4 Employee health benefits and vacation policies')
    });

    // Add docA1 to kbA1
    await knowledgeBaseService.addDocumentToKnowledgeBase(USER_A, kbA1.id, docA1.id);

    // Verify duplicate addition is rejected cleanly
    let duplicateError = false;
    try {
      await knowledgeBaseService.addDocumentToKnowledgeBase(USER_A, kbA1.id, docA1.id);
    } catch (err) {
      if (err instanceof ConflictError) duplicateError = true;
    }
    if (!duplicateError) throw new Error('Failed to prevent duplicate document membership');

    const memberDocs = await knowledgeBaseService.listKnowledgeBaseDocuments(USER_A, kbA1.id);
    if (memberDocs.length !== 1 || memberDocs[0]?.id !== docA1.id) {
      throw new Error('Member documents list returned invalid data');
    }
    console.log('  ✅ PASSED: Document added to KB; duplicate membership cleanly rejected.');

    // 4. Security & Tenant Isolation Tests
    console.log('\nTest 4: Security & Tenant Isolation Enforcement');
    const kbB1 = await knowledgeBaseService.createKnowledgeBase(USER_B, {
      name: 'User B Confidential KB'
    });
    const docB1 = await documentService.uploadDocument(USER_B, {
      filename: 'UserB_Secret.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024 * 100,
      buffer: Buffer.from('%PDF-1.4 Confidential internal financial audit')
    });

    // User A cannot view User B KB
    let userBAccessDenied = false;
    try {
      await knowledgeBaseService.getKnowledgeBase(USER_A, kbB1.id);
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof AuthorizationError) userBAccessDenied = true;
    }
    if (!userBAccessDenied) throw new Error('SECURITY VIOLATION: User A accessed User B Knowledge Base!');

    // User A cannot add User B document
    let crossDocDenied = false;
    try {
      await knowledgeBaseService.addDocumentToKnowledgeBase(USER_A, kbA1.id, docB1.id);
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof AuthorizationError) crossDocDenied = true;
    }
    if (!crossDocDenied) throw new Error('SECURITY VIOLATION: User A added User B document to KB!');

    // User A cannot delete User B KB
    let deleteDenied = false;
    try {
      await knowledgeBaseService.deleteKnowledgeBase(USER_A, kbB1.id);
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof AuthorizationError) deleteDenied = true;
    }
    if (!deleteDenied) throw new Error('SECURITY VIOLATION: User A deleted User B Knowledge Base!');
    console.log('  ✅ PASSED: Tenant isolation strictly blocks cross-user KB access, edits, and document attachments.');

    // 5. Scoped RAG Hybrid Retrieval
    console.log('\nTest 5: KB-Scoped Hybrid Vector + Lexical Retrieval');
    // Save dummy chunks and vectors for docA1 and docA2
    const dummyVector = new Array(768).fill(0.1);
    await documentRepository.saveChunksTx(docA1.id, [
      { chunkIndex: 0, pageNumber: 1, content: 'Microservices architecture with pgvector database indexes', tokenCount: 10 }
    ]);
    await documentRepository.saveChunksTx(docA2.id, [
      { chunkIndex: 0, pageNumber: 1, content: 'Employee vacation days and medical dental insurance benefits', tokenCount: 10 }
    ]);

    // Attach vector embedding manually for testing retrieval
    const vectorStr = `[${dummyVector.join(',')}]`;
    await prisma.$executeRawUnsafe(`
      UPDATE document_chunks SET embedding = '${vectorStr}'::vector WHERE document_id IN ('${docA1.id}', '${docA2.id}')
    `);
    await documentRepository.updateStatus(docA1.id, DocumentStatus.COMPLETED);
    await documentRepository.updateStatus(docA2.id, DocumentStatus.COMPLETED);

    // Retrieve scoped ONLY to kbA1 (contains docA1, NOT docA2)
    const scopedChunks = await retrievalService.retrieveContext(USER_A, 'architecture pgvector', {
      knowledgeBaseId: kbA1.id
    });

    if (scopedChunks.length === 0) {
      throw new Error('Scoped retrieval returned zero chunks for matching query in KB');
    }
    const foundDocA2 = scopedChunks.find((c) => c.documentId === docA2.id);
    if (foundDocA2) {
      throw new Error('SCOPING VIOLATION: Retrieval returned chunk from document outside the Knowledge Base!');
    }

    // Scoped retrieval for query matching docA2 (HR benefits) inside kbA1 (Engineering)
    const hrInEngineeringKb = await retrievalService.retrieveContext(USER_A, 'vacation medical dental insurance', {
      knowledgeBaseId: kbA1.id
    });
    if (hrInEngineeringKb.length !== 0) {
      throw new Error('SCOPING VIOLATION: Retrieved HR chunks inside Engineering Knowledge Base!');
    }
    console.log('  ✅ PASSED: Hybrid vector search strictly scoped to documents inside Knowledge Base.');

    // 6. Scoped Chat & Zero-Chunk Fallback
    console.log('\nTest 6: Scoped Chat & Zero-Chunk Fallback inside KB Scope');
    const chatResponse = await chatService.sendMessage(USER_A, {
      question: 'vacation dental insurance benefits',
      knowledgeBaseId: kbA1.id
    });

    if (chatResponse.answer !== "I couldn't find enough relevant information in your uploaded documents to answer that question.") {
      throw new Error(`Zero-chunk fallback failed inside KB scope. Got answer: "${chatResponse.answer}"`);
    }
    console.log('  ✅ PASSED: Zero-chunk fallback policy correctly triggered inside Knowledge Base scope.');

    // 7. Removing Document from KB (Preserves Document & File)
    console.log('\nTest 7: Removing Document from KB Preserves File & Database Record');
    await knowledgeBaseService.removeDocumentFromKnowledgeBase(USER_A, kbA1.id, docA1.id);

    const docStillInDb = await documentRepository.findByIdAndUser(docA1.id, USER_A);
    if (!docStillInDb) throw new Error('Document was deleted when removed from Knowledge Base!');

    const storageExists = await storage.exists(docA1.storageKey);
    if (!storageExists) throw new Error('Storage file was deleted when removed from Knowledge Base!');
    console.log('  ✅ PASSED: Document and storage file remain 100% intact when removed from Knowledge Base.');

    // 8. Deleting Knowledge Base (Preserves Underlying Documents)
    console.log('\nTest 8: Deleting Knowledge Base Preserves Underlying Documents & Embeddings');
    await knowledgeBaseService.addDocumentToKnowledgeBase(USER_A, kbA1.id, docA1.id);
    await knowledgeBaseService.deleteKnowledgeBase(USER_A, kbA1.id);

    const docAfterKbDelete = await documentRepository.findByIdAndUser(docA1.id, USER_A);
    if (!docAfterKbDelete) throw new Error('Document was deleted when Knowledge Base was deleted!');

    const chunksAfterKbDelete = await documentRepository.getDocumentChunkStats(docA1.id);
    if (chunksAfterKbDelete.totalChunks === 0) throw new Error('Document chunks were deleted when Knowledge Base was deleted!');
    console.log('  ✅ PASSED: Deleting Knowledge Base removes only collection grouping; documents & chunks remain intact.');

    // 9. Document Deletion Cascades Membership Rows
    console.log('\nTest 9: Document Deletion Cascades Membership Rows Cleanly');
    const kbA2 = await knowledgeBaseService.createKnowledgeBase(USER_A, { name: 'Cascade Test KB' });
    const docA3 = await documentService.uploadDocument(USER_A, {
      filename: 'Cascade_Doc.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024 * 100,
      buffer: Buffer.from('%PDF-1.4 Cascade Test Content')
    });
    await knowledgeBaseService.addDocumentToKnowledgeBase(USER_A, kbA2.id, docA3.id);

    // Delete Document
    await documentService.deleteDocument(USER_A, docA3.id);

    const isMemberAfterDocDelete = await knowledgeBaseRepository.isDocumentMember(kbA2.id, docA3.id);
    if (isMemberAfterDocDelete) throw new Error('KnowledgeBaseDocument join row was not cascaded when document was deleted!');

    const kb2StillExists = await knowledgeBaseService.getKnowledgeBase(USER_A, kbA2.id);
    if (!kb2StillExists) throw new Error('Knowledge Base was deleted when member document was deleted!');
    console.log('  ✅ PASSED: Document deletion cascades membership rows cleanly without destroying the Knowledge Base.');

  } finally {
    // Cleanup test users and data
    await prisma.knowledgeBase.deleteMany({
      where: { userId: { in: [USER_A, USER_B] } }
    });
    await prisma.document.deleteMany({
      where: { userId: { in: [USER_A, USER_B] } }
    });
  }

  console.log('\n====================================================');
  console.log('🎉 ALL PHASE 17 KNOWLEDGE BASE TESTS PASSED!');
  console.log('====================================================\n');
}

runPhase17Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ PHASE 17 TEST FAILED:', err);
    process.exit(1);
  });
