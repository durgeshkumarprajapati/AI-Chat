import dotenv from 'dotenv';
dotenv.config();

import { documentProcessor } from '../worker/src/processors/document.processor';
import { workerDocumentRepository } from '../worker/src/repositories/document.repository';
import { workerEmbeddingService } from '../worker/src/embeddings/embedding.service';
import { documentRepository } from '../src/features/documents/repositories/document.repository';
import { storage } from '../src/lib/storage';
import { prisma } from '../src/lib/prisma';
import { MockEmbeddingProvider } from './phase10-embeddings.test';
import { shutdownWorker } from '../worker/src/index';

const TEST_USER_ID = '66666666-6666-4000-a000-666666666666';

const VALID_SAMPLE_PDF = Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 56 >>
stream
BT
/F1 12 Tf
100 700 Td
(Hello World Recovery Test) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000318 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
424
%%EOF`);

async function setupMocks() {
  try {
    await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      update: {},
      create: {
        id: TEST_USER_ID,
        email: 'phase12-user@example.com',
        name: 'Phase 12 Test User'
      }
    });
  } catch {
    console.log('Using in-memory mock setup for test environment.');
  }

  (workerEmbeddingService as unknown as { provider: MockEmbeddingProvider }).provider = new MockEmbeddingProvider();
}

async function runPhase12Tests() {
  console.log('====================================================');
  console.log('Running Phase 12 Worker Recovery & Lifecycle Tests');
  console.log('====================================================\n');

  await setupMocks();

  // Test 1, 2, 3: Missing document job handling without P2025 or crash
  console.log('Test 1-3: Missing Document Job ACKed & Discarded (No P2025 Errors)');
  const missingJob = {
    jobType: 'DOCUMENT_PROCESSING',
    version: 1,
    jobId: 'job-missing-999',
    documentId: '00000000-0000-0000-0000-000000000000',
    userId: TEST_USER_ID,
    storageKey: 'documents/missing.pdf',
    attempt: 1,
    createdAt: new Date().toISOString()
  };

  const res1 = await documentProcessor.process(missingJob);
  if (res1.status !== 'STALE_DISCARD' || res1.action !== 'STALE_MISSING_DOCUMENT') {
    throw new Error(`Expected STALE_DISCARD for missing document job, got ${JSON.stringify(res1)}`);
  }

  // Verify updateStatus on missing document doesn't throw P2025
  const updateRes = await workerDocumentRepository.updateStatus('00000000-0000-0000-0000-000000000000', 'FAILED', { errorMessage: 'Test' });
  if (updateRes.count !== 0) {
    throw new Error(`Expected count 0 from updateStatus on missing document, got ${updateRes.count}`);
  }
  console.log('  ✅ PASSED: Missing document job returned STALE_DISCARD without P2025 errors.');

  // Test 4: COMPLETED document job is skipped safely
  console.log('\nTest 4: COMPLETED Document Job Skipped Safely');
  const docId4 = `doc-p12-4-${Date.now()}`;
  const storageKey4 = `documents/${TEST_USER_ID}/${docId4}/sample.pdf`;
  await storage.upload(storageKey4, VALID_SAMPLE_PDF, 'application/pdf');

  const doc4 = await documentRepository.create({
    id: docId4,
    userId: TEST_USER_ID,
    filename: 'sample.pdf',
    originalFilename: 'sample.pdf',
    mimeType: 'application/pdf',
    fileSize: VALID_SAMPLE_PDF.length,
    storageKey: storageKey4
  });

  // Mark status as COMPLETED manually
  await workerDocumentRepository.updateStatus(doc4.id, 'COMPLETED');

  const res4 = await documentProcessor.process({
    jobType: 'DOCUMENT_PROCESSING',
    version: 1,
    jobId: 'job-completed-test',
    documentId: doc4.id,
    userId: TEST_USER_ID,
    storageKey: storageKey4,
    attempt: 1,
    createdAt: new Date().toISOString()
  });

  if (res4.status !== 'SUCCESS' || res4.action !== 'SKIPPED_ALREADY_COMPLETED') {
    throw new Error(`Expected SKIPPED_ALREADY_COMPLETED, got ${JSON.stringify(res4)}`);
  }
  console.log('  ✅ PASSED: COMPLETED document job skipped reprocessing cleanly.');

  // Test 5 & 6: Duplicate Job Processing & Idempotency
  console.log('\nTest 5 & 6: Duplicate Job Processing & Chunk/Embedding Idempotency');
  // Reset doc4 to PROCESSING
  await workerDocumentRepository.updateStatus(doc4.id, 'PROCESSING');

  // Process first time
  await documentProcessor.process({
    jobType: 'DOCUMENT_PROCESSING',
    version: 1,
    jobId: 'job-dup-1',
    documentId: doc4.id,
    userId: TEST_USER_ID,
    storageKey: storageKey4,
    attempt: 1,
    createdAt: new Date().toISOString()
  });

  const chunksCount1 = await prisma.documentChunk.count({ where: { documentId: doc4.id } });

  // Process second time (duplicate job)
  await documentProcessor.process({
    jobType: 'DOCUMENT_PROCESSING',
    version: 1,
    jobId: 'job-dup-2',
    documentId: doc4.id,
    userId: TEST_USER_ID,
    storageKey: storageKey4,
    attempt: 1,
    createdAt: new Date().toISOString()
  });

  const chunksCount2 = await prisma.documentChunk.count({ where: { documentId: doc4.id } });
  if (chunksCount1 !== chunksCount2) {
    throw new Error(`Duplicate job created duplicate chunks! First: ${chunksCount1}, Second: ${chunksCount2}`);
  }
  console.log('  ✅ PASSED: Duplicate job processed idempotently without creating duplicate chunks.');

  // Test 7 & 8: Stale PROCESSING Document Startup Recovery
  console.log('\nTest 7 & 8: Stale PROCESSING Document Startup Recovery');
  const docId8 = `doc-p12-8-${Date.now()}`;
  const storageKey8 = `documents/${TEST_USER_ID}/${docId8}/stale.pdf`;
  await storage.upload(storageKey8, VALID_SAMPLE_PDF, 'application/pdf');

  const doc8 = await documentRepository.create({
    id: docId8,
    userId: TEST_USER_ID,
    filename: 'stale.pdf',
    originalFilename: 'stale.pdf',
    mimeType: 'application/pdf',
    fileSize: VALID_SAMPLE_PDF.length,
    storageKey: storageKey8
  });

  // Set updatedAt to 30 minutes in the past
  const past30Mins = new Date(Date.now() - 30 * 60 * 1000);
  await prisma.document.update({
    where: { id: doc8.id },
    data: { status: 'PROCESSING', updatedAt: past30Mins }
  });

  const recoveredCount = await workerDocumentRepository.recoverStaleProcessingDocuments(15);
  if (recoveredCount < 1) {
    throw new Error(`Expected at least 1 stale document to be recovered, got ${recoveredCount}`);
  }

  const recoveredDoc8 = await documentRepository.findByIdAndUser(doc8.id, TEST_USER_ID);
  if (recoveredDoc8?.status !== 'FAILED' && recoveredDoc8?.status !== 'COMPLETED') {
    throw new Error(`Expected stale document status to be updated, got ${recoveredDoc8?.status}`);
  }
  console.log('  ✅ PASSED: Stale PROCESSING document recovered safely on startup.');

  // Test 9 & 10: Permanent vs Transient Error Classification
  console.log('\nTest 9 & 10: Permanent vs Transient Error Classification');
  const docId10 = `doc-p12-10-${Date.now()}`;
  const storageKey10 = `documents/${TEST_USER_ID}/${docId10}/corrupt.pdf`;
  await storage.upload(storageKey10, Buffer.from('NOT A PDF'), 'application/pdf');

  const doc10 = await documentRepository.create({
    id: docId10,
    userId: TEST_USER_ID,
    filename: 'corrupt.pdf',
    originalFilename: 'corrupt.pdf',
    mimeType: 'application/pdf',
    fileSize: 9,
    storageKey: storageKey10
  });

  const res10 = await documentProcessor.process({
    jobType: 'DOCUMENT_PROCESSING',
    version: 1,
    jobId: 'job-corrupt-10',
    documentId: doc10.id,
    userId: TEST_USER_ID,
    storageKey: storageKey10,
    attempt: 1,
    createdAt: new Date().toISOString()
  });

  if (res10.status !== 'FAILED' || res10.action !== 'PERMANENT_ERROR') {
    throw new Error(`Expected PERMANENT_ERROR for corrupt PDF, got ${JSON.stringify(res10)}`);
  }
  console.log('  ✅ PASSED: Corrupt PDF classified as PERMANENT_ERROR and marked FAILED.');

  // Test 13, 14 & 15: Graceful Idempotent Shutdown (SIGINT & SIGTERM Safety)
  console.log('\nTest 13-15: Graceful Idempotent Shutdown (SIGINT/SIGTERM Safety)');
  await shutdownWorker('SIGINT');
  await shutdownWorker('SIGTERM'); // Call second time to verify idempotency
  console.log('  ✅ PASSED: Worker shutdown executed idempotently without Channel closing errors.');

  // Clean up
  await storage.delete(storageKey4);
  await storage.delete(storageKey8);
  await storage.delete(storageKey10);
  try {
    await prisma.document.deleteMany({ where: { userId: TEST_USER_ID } });
  } catch {
    console.log('Cleaned up mock records.');
  }

  console.log('\n====================================================');
  console.log('🎉 ALL PHASE 12 WORKER RECOVERY TESTS PASSED!');
  console.log('====================================================\n');
}

runPhase12Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ PHASE 12 TEST FAILED:', err);
    process.exit(1);
  });
