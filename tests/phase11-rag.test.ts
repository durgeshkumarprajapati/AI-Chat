import dotenv from 'dotenv';
dotenv.config();

import { RetrievalService } from '../src/features/rag/retrieval/retrieval.service';
import { ChatService } from '../src/features/rag/chat/chat.service';
import { LLMProvider, LLMGenerateInput } from '../src/features/rag/llm/llm.provider';
import { MockEmbeddingProvider } from './phase10-embeddings.test';
import { RetrievedChunk } from '../src/features/rag/retrieval/retrieval.types';
import { documentRepository } from '../src/features/documents/repositories/document.repository';
import { storage } from '../src/lib/storage';
import { documentProcessor } from '../worker/src/processors/document.processor';
import { workerDocumentRepository } from '../worker/src/repositories/document.repository';
import { workerEmbeddingService } from '../worker/src/embeddings/embedding.service';
import { prisma } from '../src/lib/prisma';

const TEST_USER_ID = '55555555-5555-4000-a000-555555555555';
const OTHER_USER_ID = '99999999-9999-4000-a000-999999999999';

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
(Hello World from PDF Page 1) Tj
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

export class MockLLMProvider implements LLMProvider {
  public lastInput: LLMGenerateInput | null = null;
  public mockResponse = 'According to the uploaded document, the deployment pipeline runs automatically.';
  public failMode = false;

  public async generateAnswer(input: LLMGenerateInput): Promise<string> {
    this.lastInput = input;
    if (this.failMode) {
      throw new Error('LLM Provider connection error');
    }
    return this.mockResponse;
  }
}

export class MockRetrievalService extends RetrievalService {
  public mockChunks: RetrievedChunk[] = [];
  public lastUserId: string | null = null;
  public lastQuestion: string | null = null;

  constructor() {
    super(new MockEmbeddingProvider());
  }

  public override async retrieveContext(
    userId: string,
    question: string
  ): Promise<RetrievedChunk[]> {
    this.lastUserId = userId;
    this.lastQuestion = question;
    return this.mockChunks;
  }
}

async function setupMocks() {
  try {
    await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      update: {},
      create: {
        id: TEST_USER_ID,
        email: 'phase11-user@example.com',
        name: 'Phase 11 Test User'
      }
    });

    await prisma.user.upsert({
      where: { id: OTHER_USER_ID },
      update: {},
      create: {
        id: OTHER_USER_ID,
        email: 'other-user@example.com',
        name: 'Other Test User'
      }
    });
  } catch {
    console.log('Using in-memory mock setup for test environment.');
  }

  // Inject MockEmbeddingProvider into workerEmbeddingService for tests
  (workerEmbeddingService as unknown as { provider: MockEmbeddingProvider }).provider = new MockEmbeddingProvider();
}

async function runPhase11Tests() {
  console.log('====================================================');
  console.log('Running Phase 11 RAG Retrieval & Lifecycle Test Suite');
  console.log('====================================================\n');

  await setupMocks();

  // Test 1: Successful complete processing changes Document.status from PROCESSING -> COMPLETED
  console.log('Test 1: Complete processing changes Document.status to COMPLETED');
  const docId1 = `doc-lifecycle-1-${Date.now()}`;
  const storageKey1 = `documents/${TEST_USER_ID}/${docId1}/test1.pdf`;
  await storage.upload(storageKey1, VALID_SAMPLE_PDF, 'application/pdf');

  const doc1 = await documentRepository.create({
    id: docId1,
    userId: TEST_USER_ID,
    filename: 'test1.pdf',
    originalFilename: 'test1.pdf',
    mimeType: 'application/pdf',
    fileSize: VALID_SAMPLE_PDF.length,
    storageKey: storageKey1
  });

  await documentProcessor.process({
    jobType: 'DOCUMENT_PROCESSING',
    version: 1,
    jobId: `job-1-${Date.now()}`,
    documentId: doc1.id,
    userId: TEST_USER_ID,
    storageKey: storageKey1,
    attempt: 1,
    createdAt: new Date().toISOString()
  });

  const updatedDoc1 = await documentRepository.findByIdAndUser(doc1.id, TEST_USER_ID);
  if (updatedDoc1?.status !== 'COMPLETED') {
    throw new Error(`Expected status COMPLETED, got ${updatedDoc1?.status}`);
  }
  console.log('  ✅ PASSED: Document status transitioned from PROCESSING to COMPLETED.');

  // Test 2: PDF extraction failure changes status to FAILED
  console.log('\nTest 2: PDF extraction failure changes status to FAILED');
  const docId2 = `doc-lifecycle-2-${Date.now()}`;
  const storageKey2 = `documents/${TEST_USER_ID}/${docId2}/corrupt.pdf`;
  await storage.upload(storageKey2, Buffer.from('NOT A PDF FILE'), 'application/pdf');

  const doc2 = await documentRepository.create({
    id: docId2,
    userId: TEST_USER_ID,
    filename: 'corrupt.pdf',
    originalFilename: 'corrupt.pdf',
    mimeType: 'application/pdf',
    fileSize: 14,
    storageKey: storageKey2
  });

  try {
    await documentProcessor.process({
      jobType: 'DOCUMENT_PROCESSING',
      version: 1,
      jobId: `job-2-${Date.now()}`,
      documentId: doc2.id,
      userId: TEST_USER_ID,
      storageKey: storageKey2,
      attempt: 1,
      createdAt: new Date().toISOString()
    });
  } catch {
    // Expected error
  }

  const updatedDoc2 = await documentRepository.findByIdAndUser(doc2.id, TEST_USER_ID);
  if (updatedDoc2?.status !== 'FAILED') {
    throw new Error(`Expected status FAILED, got ${updatedDoc2?.status}`);
  }
  console.log('  ✅ PASSED: PDF extraction failure updated status to FAILED.');

  // Test 3: Chunk persistence failure does not mark document COMPLETED
  console.log('\nTest 3: Chunk persistence failure does not mark document COMPLETED');
  const docId3 = `doc-lifecycle-3-${Date.now()}`;
  const storageKey3 = `documents/${TEST_USER_ID}/${docId3}/test3.pdf`;
  await storage.upload(storageKey3, VALID_SAMPLE_PDF, 'application/pdf');

  const doc3 = await documentRepository.create({
    id: docId3,
    userId: TEST_USER_ID,
    filename: 'test3.pdf',
    originalFilename: 'test3.pdf',
    mimeType: 'application/pdf',
    fileSize: VALID_SAMPLE_PDF.length,
    storageKey: storageKey3
  });

  const originalSaveChunksTx = workerDocumentRepository.saveChunksTx;
  workerDocumentRepository.saveChunksTx = async () => {
    throw new Error('Simulated DB chunk persistence error');
  };

  try {
    await documentProcessor.process({
      jobType: 'DOCUMENT_PROCESSING',
      version: 1,
      jobId: `job-3-${Date.now()}`,
      documentId: doc3.id,
      userId: TEST_USER_ID,
      storageKey: storageKey3,
      attempt: 1,
      createdAt: new Date().toISOString()
    });
  } catch {
    // Expected error
  } finally {
    workerDocumentRepository.saveChunksTx = originalSaveChunksTx;
  }

  const updatedDoc3 = await documentRepository.findByIdAndUser(doc3.id, TEST_USER_ID);
  if (updatedDoc3?.status === 'COMPLETED') {
    throw new Error('Document marked COMPLETED despite chunk persistence failure!');
  }
  console.log('  ✅ PASSED: Chunk persistence failure prevented COMPLETED status.');

  // Test 4: Embedding failure does not mark document COMPLETED
  console.log('\nTest 4: Embedding failure does not mark document COMPLETED');
  const docId4 = `doc-lifecycle-4-${Date.now()}`;
  const storageKey4 = `documents/${TEST_USER_ID}/${docId4}/test4.pdf`;
  await storage.upload(storageKey4, VALID_SAMPLE_PDF, 'application/pdf');

  const doc4 = await documentRepository.create({
    id: docId4,
    userId: TEST_USER_ID,
    filename: 'test4.pdf',
    originalFilename: 'test4.pdf',
    mimeType: 'application/pdf',
    fileSize: VALID_SAMPLE_PDF.length,
    storageKey: storageKey4
  });

  const originalProcessEmbeddings = workerEmbeddingService.processDocumentEmbeddings;
  workerEmbeddingService.processDocumentEmbeddings = async () => {
    throw new Error('Simulated embedding generation failure');
  };

  try {
    await documentProcessor.process({
      jobType: 'DOCUMENT_PROCESSING',
      version: 1,
      jobId: `job-4-${Date.now()}`,
      documentId: doc4.id,
      userId: TEST_USER_ID,
      storageKey: storageKey4,
      attempt: 1,
      createdAt: new Date().toISOString()
    });
  } catch {
    // Expected error
  } finally {
    workerEmbeddingService.processDocumentEmbeddings = originalProcessEmbeddings;
  }

  const updatedDoc4 = await documentRepository.findByIdAndUser(doc4.id, TEST_USER_ID);
  if (updatedDoc4?.status === 'COMPLETED') {
    throw new Error('Document marked COMPLETED despite embedding failure!');
  }
  console.log('  ✅ PASSED: Embedding failure prevented COMPLETED status.');

  // Test 5: Successful retry can eventually mark document COMPLETED
  console.log('\nTest 5: Successful retry marks document COMPLETED');
  await documentRepository.updateStatus(doc4.id, 'PROCESSING');
  await documentProcessor.process({
    jobType: 'DOCUMENT_PROCESSING',
    version: 1,
    jobId: `job-5-${Date.now()}`,
    documentId: doc4.id,
    userId: TEST_USER_ID,
    storageKey: storageKey4,
    attempt: 2,
    createdAt: new Date().toISOString()
  });

  const updatedDoc5 = await documentRepository.findByIdAndUser(doc4.id, TEST_USER_ID);
  if (updatedDoc5?.status !== 'COMPLETED') {
    throw new Error(`Expected retry status COMPLETED, got ${updatedDoc5?.status}`);
  }
  console.log('  ✅ PASSED: Retry attempt successfully updated Document status to COMPLETED.');

  // Test 6: Already embedded/idempotent retry still marks document COMPLETED
  console.log('\nTest 6: Idempotent retry still marks document COMPLETED');
  await documentProcessor.process({
    jobType: 'DOCUMENT_PROCESSING',
    version: 1,
    jobId: `job-6-${Date.now()}`,
    documentId: doc4.id,
    userId: TEST_USER_ID,
    storageKey: storageKey4,
    attempt: 3,
    createdAt: new Date().toISOString()
  });

  const updatedDoc6 = await documentRepository.findByIdAndUser(doc4.id, TEST_USER_ID);
  if (updatedDoc6?.status !== 'COMPLETED') {
    throw new Error(`Expected idempotent status COMPLETED, got ${updatedDoc6?.status}`);
  }
  console.log('  ✅ PASSED: Idempotent reprocessing maintained COMPLETED status safely.');

  // Test 7: RAG fallback response does not display citations (empty citations array)
  console.log('\nTest 7: RAG fallback response returns empty citations array');
  const mockRetEmpty = new MockRetrievalService();
  mockRetEmpty.mockChunks = [];
  const mockLLM7 = new MockLLMProvider();
  const chatService7 = new ChatService(mockRetEmpty, mockLLM7);

  const res7 = await chatService7.sendMessage(TEST_USER_ID, {
    question: 'What is quantum teleportation?'
  });

  if (res7.citations.length !== 0) {
    throw new Error(`Expected empty citations array for fallback response, got ${res7.citations.length}`);
  }
  if (!res7.answer.includes("couldn't find enough relevant information")) {
    throw new Error('Fallback response text missing expected non-hallucination phrase');
  }
  console.log('  ✅ PASSED: RAG fallback response returned 0 citations and deterministic message.');

  // Test 8: Normal grounded RAG response displays citations
  console.log('\nTest 8: Grounded RAG response returns populated citations');
  const mockRet8 = new MockRetrievalService();
  mockRet8.mockChunks = [
    {
      id: 'chunk-8',
      documentId: doc1.id,
      filename: 'test1.pdf',
      chunkIndex: 0,
      pageNumber: 1,
      content: 'Hello World from PDF Page 1',
      tokenCount: 6,
      similarity: 0.92,
      metadata: { pageNumber: 1 }
    }
  ];

  const mockLLM8 = new MockLLMProvider();
  const chatService8 = new ChatService(mockRet8, mockLLM8);

  const res8 = await chatService8.sendMessage(TEST_USER_ID, {
    question: 'What is written on page 1?'
  });

  if (res8.citations.length === 0) {
    throw new Error('Expected citations for grounded answer, got 0');
  }
  if (res8.citations[0]?.filename !== 'test1.pdf' || res8.citations[0]?.pageNumber !== 1) {
    throw new Error('Citation filename or page number mismatch');
  }
  console.log('  ✅ PASSED: Grounded RAG response returned populated citations:', res8.citations[0]);

  // Clean up
  await storage.delete(storageKey1);
  await storage.delete(storageKey2);
  await storage.delete(storageKey3);
  await storage.delete(storageKey4);

  console.log('\n====================================================');
  console.log('🎉 ALL PHASE 11 LIFECYCLE & RAG TESTS PASSED!');
  console.log('====================================================\n');
}

runPhase11Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ PHASE 11 TEST FAILED:', err);
    process.exit(1);
  });
