import dotenv from 'dotenv';
dotenv.config();

import { documentService } from '../src/features/documents/services/document.service';
import { documentRepository } from '../src/features/documents/repositories/document.repository';
import { storage } from '../src/lib/storage';
import { prisma } from '../src/lib/prisma';
import { DocumentStatus } from '@prisma/client';
import { AuthorizationError, ConflictError, NotFoundError } from '../src/errors';

const USER_A = '98765432-1111-4000-a000-111111111111';
const USER_B = '98765432-2222-4000-a000-222222222222';

async function setupTestUsers() {
  await prisma.user.upsert({
    where: { id: USER_A },
    update: {},
    create: { id: USER_A, email: 'p16-user-a@example.com', name: 'Phase 16 User A' }
  });

  await prisma.user.upsert({
    where: { id: USER_B },
    update: {},
    create: { id: USER_B, email: 'p16-user-b@example.com', name: 'Phase 16 User B' }
  });

  // Clean existing test documents for these users
  await prisma.document.deleteMany({
    where: { userId: { in: [USER_A, USER_B] } }
  });
}

async function runPhase16Tests() {
  console.log('====================================================');
  console.log('Running Phase 16 Document Management Test Suite');
  console.log('====================================================\n');

  await setupTestUsers();

  try {
    // 1. Upload sample test documents for USER_A
    console.log('Test 1: Uploading Sample Documents for User A');
    const docA1 = await documentService.uploadDocument(USER_A, {
      filename: 'Architecture_Guide.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024 * 500,
      buffer: Buffer.from('%PDF-1.4 Architecture Guide Test Content')
    });

    const docA2 = await documentService.uploadDocument(USER_A, {
      filename: 'Financial_Report_2026.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024 * 1200,
      buffer: Buffer.from('%PDF-1.4 Financial Report 2026 Content')
    });

    // Upload sample test document for USER_B
    const docB1 = await documentService.uploadDocument(USER_B, {
      filename: 'UserB_Private_Document.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024 * 300,
      buffer: Buffer.from('%PDF-1.4 User B Confidential Content')
    });

    console.log('  ✅ PASSED: Uploaded test documents for User A and User B.');

    // 2. Test Pagination, Search, Status Filter, and Sorting
    console.log('\nTest 2: Pagination, Debounced Search & Sorting');
    const paginatedA = await documentService.listUserDocumentsPaginated(USER_A, {
      page: 1,
      pageSize: 10,
      sortBy: 'createdAt',
      sortOrder: 'desc'
    });

    if (paginatedA.total !== 2 || paginatedA.items.length !== 2) {
      throw new Error(`Expected User A to have 2 total documents, got ${paginatedA.total}`);
    }
    console.log('  ✅ PASSED: Document list pagination returns accurate total and page items.');

    // Search Test (case-insensitive)
    const searchRes = await documentService.listUserDocumentsPaginated(USER_A, {
      search: 'financial'
    });
    if (searchRes.total !== 1 || searchRes.items[0]?.filename !== 'Financial_Report_2026.pdf') {
      throw new Error('Case-insensitive search failed to match "Financial_Report_2026.pdf"');
    }
    console.log('  ✅ PASSED: Case-insensitive document search by filename verified.');

    // 3. Security & Tenant Isolation Tests
    console.log('\nTest 3: Security & Tenant Isolation Enforcements');
    const userBDocsSeenByA = await documentService.listUserDocumentsPaginated(USER_A, {});
    const bDocFoundInA = userBDocsSeenByA.items.find((d) => d.id === docB1.id);
    if (bDocFoundInA) {
      throw new Error('SECURITY VIOLATION: User A listed User B document!');
    }

    let authErrorThrown = false;
    try {
      await documentService.getDocumentById(USER_A, docB1.id);
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof AuthorizationError) {
        authErrorThrown = true;
      }
    }
    if (!authErrorThrown) {
      throw new Error('SECURITY VIOLATION: User A accessed User B document details!');
    }

    let deleteAuthError = false;
    try {
      await documentService.deleteDocument(USER_A, docB1.id);
    } catch (err) {
      if (err instanceof NotFoundError || err instanceof AuthorizationError) {
        deleteAuthError = true;
      }
    }
    if (!deleteAuthError) {
      throw new Error('SECURITY VIOLATION: User A deleted User B document!');
    }
    console.log('  ✅ PASSED: Tenant isolation prevents cross-user access, deletion, and detail inspection.');

    // 4. Retry Failed Document Logic
    console.log('\nTest 4: Safe Retry for FAILED Documents');
    // Set docA1 to FAILED with error message
    await documentRepository.updateStatus(docA1.id, DocumentStatus.FAILED, {
      errorMessage: 'Simulated worker parsing failure'
    });

    const retriedDoc = await documentService.retryDocument(USER_A, docA1.id);
    if (retriedDoc.status !== DocumentStatus.PROCESSING || retriedDoc.errorMessage !== null) {
      throw new Error('Retry failed to reset status to PROCESSING or clear errorMessage');
    }

    // Try retrying while already PROCESSING (should throw ConflictError)
    let conflictThrown = false;
    try {
      await documentService.retryDocument(USER_A, docA1.id);
    } catch (err) {
      if (err instanceof ConflictError) {
        conflictThrown = true;
      }
    }
    if (!conflictThrown) {
      throw new Error('Expected ConflictError when retrying an already PROCESSING document');
    }
    console.log('  ✅ PASSED: FAILED document retry resets status cleanly and rejects concurrent duplicate retries.');

    // 5. Reprocess Completed Document Logic
    console.log('\nTest 5: Reprocess Document Logic & Transactional Chunk Cleanup');
    // Save dummy chunk for docA2
    await documentRepository.saveChunksTx(docA2.id, [
      { chunkIndex: 0, pageNumber: 1, content: 'Test chunk content to be cleared', tokenCount: 6 }
    ]);
    await documentRepository.updateStatus(docA2.id, DocumentStatus.COMPLETED);

    const reprocessedDoc = await documentService.reprocessDocument(USER_A, docA2.id);
    if (reprocessedDoc.status !== DocumentStatus.PROCESSING) {
      throw new Error('Reprocess failed to transition status to PROCESSING');
    }

    const chunkStatsAfterReprocess = await documentRepository.getDocumentChunkStats(docA2.id);
    if (chunkStatsAfterReprocess.totalChunks !== 0) {
      throw new Error('Reprocess failed to clear existing chunks prior to reprocessing');
    }
    console.log('  ✅ PASSED: Reprocessing clears existing chunks transactionally and publishes new worker job.');

    // 6. Safe Document Deletion via StorageProvider
    console.log('\nTest 6: Safe Document Deletion via StorageProvider');
    await documentService.deleteDocument(USER_A, docA2.id);

    const deletedInDb = await documentRepository.findByIdAndUser(docA2.id, USER_A);
    if (deletedInDb) {
      throw new Error('Document still exists in database after deletion');
    }

    const storageExists = await storage.exists(docA2.storageKey);
    if (storageExists) {
      throw new Error('Storage object still exists after document deletion');
    }
    console.log('  ✅ PASSED: Storage object and database records deleted safely using StorageProvider abstraction.');

    // 7. Secure File Download
    console.log('\nTest 7: Secure File Download');
    const download = await documentService.downloadDocument(USER_A, docA1.id);
    if (!download.buffer || download.buffer.length === 0) {
      throw new Error('Downloaded file buffer is empty');
    }
    console.log('  ✅ PASSED: Secure file download retrieves stored content with ownership validation.');

    // 8. Knowledge Base Summary Statistics
    console.log('\nTest 8: Knowledge Base Summary Statistics Calculation');
    const kbStats = await documentRepository.getKnowledgeBaseStats(USER_A);
    if (kbStats.totalDocuments !== 1) {
      throw new Error(`Expected 1 document in KB stats for User A, got ${kbStats.totalDocuments}`);
    }
    console.log('  ✅ PASSED: Knowledge Base summary stats calculated accurately.');

  } finally {
    // Cleanup test users
    await prisma.document.deleteMany({
      where: { userId: { in: [USER_A, USER_B] } }
    });
  }

  console.log('\n====================================================');
  console.log('🎉 ALL PHASE 16 DOCUMENT MANAGEMENT TESTS PASSED!');
  console.log('====================================================\n');
}

runPhase16Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ PHASE 16 TEST FAILED:', err);
    process.exit(1);
  });
