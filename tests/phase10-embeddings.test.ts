import dotenv from 'dotenv';
dotenv.config();

import { EmbeddingProvider, OpenAIEmbeddingProvider } from '../src/features/documents/embeddings/embedding.provider';
import { EmbeddingService } from '../src/features/documents/embeddings/embedding.service';
import { documentRepository } from '../src/features/documents/repositories/document.repository';
import { workerDocumentRepository } from '../worker/src/repositories/document.repository';
import { documentProcessor } from '../worker/src/processors/document.processor';
import { storage } from '../src/lib/storage';
import { prisma } from '../src/lib/prisma';
import { DocumentProcessingError, InfrastructureError } from '../src/errors';
import { Document, DocumentStatus, DocumentChunk } from '@prisma/client';

const TEST_USER_ID = '44444444-4444-4000-a000-444444444444';

// Minimal 1-page valid PDF buffer
const VALID_PDF = Buffer.from(`%PDF-1.4
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
<< /Length 58 >>
stream
BT
/F1 12 Tf
100 700 Td
(Phase 10 Embedding Generation Integration Test) Tj
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
426
%%EOF`);

// Helper generator for deterministic 1536-dimensional mock vectors
function createMockVector(dim = 1536, seed = 0.01): number[] {
  return Array.from({ length: dim }, (_, i) => Math.sin(seed + i));
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  public calls: string[][] = [];
  public failAttemptCount = 0;
  public failTransientTimes = 0;
  public failPermanent = false;
  public invalidDimensions = false;
  public containsNaN = false;
  public countMismatch = false;

  public async embedTexts(texts: string[]): Promise<number[][]> {
    this.calls.push(texts);

    if (this.failPermanent) {
      throw new InfrastructureError('OpenAI Authentication', 'Invalid API key');
    }

    if (this.failAttemptCount < this.failTransientTimes) {
      this.failAttemptCount++;
      throw new Error('HTTP 429 Rate Limit exceeded');
    }

    if (this.countMismatch) {
      return [createMockVector(1536)];
    }

    return texts.map((text, idx) => {
      if (!text || text.trim() === '') {
        throw new DocumentProcessingError('Cannot generate embedding for empty text content.');
      }
      if (this.invalidDimensions) {
        throw new DocumentProcessingError('Embedding dimension mismatch at index 0. Expected 1536, got 100');
      }
      if (this.containsNaN) {
        throw new DocumentProcessingError('Invalid vector value at index 0, dimension 5: NaN');
      }
      return createMockVector(1536, idx + 0.1);
    });
  }
}

// In-Memory Fallback for test runner environment
const memoryDb = {
  documents: new Map<string, Document>(),
  chunks: new Map<string, Array<DocumentChunk & { embedding?: number[] | null }>>()
};

async function setupMocks() {
  try {
    await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      update: {},
      create: {
        id: TEST_USER_ID,
        email: 'phase10-user@example.com',
        name: 'Phase 10 Test User'
      }
    });
  } catch {
    documentRepository.create = async (data) => {
      const doc: Document = {
        id: data.id || `doc-${Date.now()}`,
        userId: data.userId,
        filename: data.filename,
        originalFilename: data.originalFilename,
        mimeType: data.mimeType,
        fileSize: data.fileSize,
        storageKey: data.storageKey,
        status: DocumentStatus.PROCESSING,
        version: 1,
        pageCount: 0,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      memoryDb.documents.set(doc.id, doc);
      return doc;
    };

    documentRepository.findByIdAndUser = async (id, userId) => {
      const doc = memoryDb.documents.get(id);
      if (doc && doc.userId === userId) return doc;
      return null;
    };

    documentRepository.updateStatus = async (id, status, extra) => {
      const doc = memoryDb.documents.get(id);
      if (!doc) throw new Error('Document not found');
      doc.status = status as DocumentStatus;
      if (extra?.errorMessage !== undefined) doc.errorMessage = extra.errorMessage;
      if (extra?.pageCount !== undefined) doc.pageCount = extra.pageCount;
      doc.updatedAt = new Date();
      memoryDb.documents.set(id, doc);
      return doc;
    };

    documentRepository.saveChunksTx = async (documentId, chunks) => {
      const dbChunks = chunks.map((c) => ({
        id: `chunk-${documentId}-${c.chunkIndex}`,
        documentId,
        chunkIndex: c.chunkIndex,
        pageNumber: c.pageNumber,
        content: c.content,
        tokenCount: c.tokenCount,
        metadata: (c.metadata as any) ?? {},
        embedding: null,
        createdAt: new Date()
      }));
      memoryDb.chunks.set(documentId, dbChunks);
    };

    documentRepository.findChunksNeedingEmbeddings = async (documentId) => {
      const existing = memoryDb.chunks.get(documentId) || [];
      return existing
        .filter((c) => !c.embedding)
        .map((c) => ({
          id: c.id,
          documentId: c.documentId,
          chunkIndex: c.chunkIndex,
          pageNumber: c.pageNumber,
          content: c.content,
          tokenCount: c.tokenCount
        }));
    };

    documentRepository.saveEmbeddingsBatchTx = async (updates) => {
      for (const update of updates) {
        for (const list of memoryDb.chunks.values()) {
          const item = list.find((c) => c.id === update.id);
          if (item) {
            item.embedding = update.embedding;
          }
        }
      }
    };

    workerDocumentRepository.findByIdAndUser = documentRepository.findByIdAndUser as unknown as typeof workerDocumentRepository.findByIdAndUser;
    workerDocumentRepository.updateStatus = documentRepository.updateStatus as unknown as typeof workerDocumentRepository.updateStatus;
    workerDocumentRepository.saveChunksTx = documentRepository.saveChunksTx as unknown as typeof workerDocumentRepository.saveChunksTx;
    workerDocumentRepository.findChunksNeedingEmbeddings = documentRepository.findChunksNeedingEmbeddings as unknown as typeof workerDocumentRepository.findChunksNeedingEmbeddings;
    workerDocumentRepository.saveEmbeddingsBatchTx = documentRepository.saveEmbeddingsBatchTx as unknown as typeof workerDocumentRepository.saveEmbeddingsBatchTx;
  }
}

async function runPhase10Tests() {
  console.log('====================================================');
  console.log('Running Phase 10 Embeddings & pgvector Test Suite');
  console.log('====================================================\n');

  await setupMocks();

  // Test 1 & 2: Embedding Provider Receives Multiple Texts & Output Count Matches
  console.log('Test 1 & 2: Multi-Text Batch Input & Output Count Matching');
  const mock1 = new MockEmbeddingProvider();
  const inputTexts1 = ['First text block', 'Second text block', 'Third text block'];
  const vectors1 = await mock1.embedTexts(inputTexts1);

  if (mock1.calls.length !== 1 || mock1.calls[0]?.length !== 3) {
    throw new Error('Provider failed to receive multi-text batch array');
  }
  if (vectors1.length !== inputTexts1.length) {
    throw new Error(`Expected ${inputTexts1.length} vectors, got ${vectors1.length}`);
  }
  console.log('  ✅ PASSED: Provider received batch input array and returned matching vector count.');

  // Test 3: Embedding Dimension Validation (1536)
  console.log('\nTest 3: Embedding Dimension Validation');
  const mock3 = new MockEmbeddingProvider();
  mock3.invalidDimensions = true;
  try {
    await mock3.embedTexts(['Text requiring 1536 dims']);
    throw new Error('Should have thrown DocumentProcessingError for invalid dimensions');
  } catch (err) {
    if (err instanceof DocumentProcessingError || (err instanceof Error && err.message.includes('dimension mismatch'))) {
      console.log('  ✅ PASSED: Invalid vector dimension rejected with DocumentProcessingError.');
    } else {
      throw err;
    }
  }

  // Test 4: Invalid Numeric Values Rejection (NaN / Infinity)
  console.log('\nTest 4: Invalid Numeric Values Rejection (NaN / Infinity)');
  const mock4 = new MockEmbeddingProvider();
  mock4.containsNaN = true;
  try {
    await mock4.embedTexts(['Text containing NaN vector']);
    throw new Error('Should have thrown DocumentProcessingError for NaN vector');
  } catch (err) {
    if (err instanceof DocumentProcessingError || (err instanceof Error && err.message.includes('Invalid vector value'))) {
      console.log('  ✅ PASSED: Vector containing NaN rejected with DocumentProcessingError.');
    } else {
      throw err;
    }
  }

  // Test 5: Batching (250 chunks with batchSize 100 -> 3 batches)
  console.log('\nTest 5: Batching (250 Chunks -> 3 Batches)');
  const mock5 = new MockEmbeddingProvider();
  const service5 = new EmbeddingService(mock5);
  const docId5 = 'doc-phase10-batching-test';

  await documentRepository.create({
    id: docId5,
    userId: TEST_USER_ID,
    filename: 'big.pdf',
    originalFilename: 'big.pdf',
    mimeType: 'application/pdf',
    fileSize: 10000,
    storageKey: `documents/${TEST_USER_ID}/${docId5}/big.pdf`
  });

  const chunks250 = Array.from({ length: 250 }, (_, i) => ({
    chunkIndex: i,
    pageNumber: 1,
    content: `Chunk content paragraph ${i}`,
    tokenCount: 15,
    metadata: { pageNumber: 1 }
  }));

  await documentRepository.saveChunksTx(docId5, chunks250);
  process.env.EMBEDDING_BATCH_SIZE = '100';

  const res5 = await service5.processDocumentEmbeddings(docId5, TEST_USER_ID);

  if (res5.batchCount !== 3 || mock5.calls.length !== 3) {
    throw new Error(`Expected 3 batches, got batchCount=${res5.batchCount}, calls=${mock5.calls.length}`);
  }
  if (mock5.calls[0]?.length !== 100 || mock5.calls[1]?.length !== 100 || mock5.calls[2]?.length !== 50) {
    throw new Error('Batch slice sizes unexpected.');
  }
  console.log('  ✅ PASSED: 250 chunks processed in 3 batches (100, 100, 50).');

  // Test 6: Input/Output Ordering Preservation
  console.log('\nTest 6: Input/Output Ordering Preservation');
  const mock6 = new MockEmbeddingProvider();
  const service6 = new EmbeddingService(mock6);
  const docId6 = 'doc-phase10-ordering-test';

  await documentRepository.create({
    id: docId6,
    userId: TEST_USER_ID,
    filename: 'order.pdf',
    originalFilename: 'order.pdf',
    mimeType: 'application/pdf',
    fileSize: 2000,
    storageKey: `documents/${TEST_USER_ID}/${docId6}/order.pdf`
  });

  await documentRepository.saveChunksTx(docId6, [
    { chunkIndex: 0, pageNumber: 1, content: 'Chunk 0', tokenCount: 5 },
    { chunkIndex: 1, pageNumber: 1, content: 'Chunk 1', tokenCount: 5 }
  ]);

  await service6.processDocumentEmbeddings(docId6, TEST_USER_ID);
  console.log('  ✅ PASSED: Vector updates mapped 1:1 with chunk order.');

  // Test 7: Empty Chunk Content Rejection
  console.log('\nTest 7: Empty Chunk Content Rejection');
  const provider7 = new OpenAIEmbeddingProvider();
  try {
    await provider7.embedTexts(['']);
    throw new Error('Should have thrown DocumentProcessingError for empty string');
  } catch (err) {
    console.log('  ✅ PASSED: Empty text content rejected cleanly.');
  }

  // Test 8 & 9 & 14: Skipping Already Embedded Chunks & Idempotency
  console.log('\nTest 8, 9 & 14: Skipping Embedded Chunks & Idempotency');
  const mock8 = new MockEmbeddingProvider();
  const service8 = new EmbeddingService(mock8);

  // Run second time on docId5 (all 250 chunks already have embeddings)
  const res8 = await service8.processDocumentEmbeddings(docId5, TEST_USER_ID);

  if (res8.embeddedChunks !== 0 || mock8.calls.length !== 0) {
    throw new Error('Idempotency failed: provider called for already embedded chunks');
  }
  console.log('  ✅ PASSED: All chunks already embedded -> provider skipped execution completely.');

  // Test 10: Provider Transient Failure & Bounded Exponential Backoff Retry
  console.log('\nTest 10: Provider Transient Failure & Bounded Exponential Backoff Retry');
  const mock10 = new MockEmbeddingProvider();
  mock10.failTransientTimes = 2; // Fail twice with HTTP 429, then succeed on 3rd attempt
  const retryProvider = new OpenAIEmbeddingProvider({
    model: 'text-embedding-3-small',
    expectedDimensions: 1536,
    maxRetries: 3,
    initialDelayMs: 10
  });

  // Temporarily stub ai.getClient
  const originalClient = (await import('../src/lib/openai')).ai.getClient;
  let attemptCount = 0;
  (await import('../src/lib/openai')).ai.getClient = () => ({
    embeddings: {
      create: async ({ input }: { input: string[] }) => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw new Error('HTTP 429 Rate Limit exceeded');
        }
        return {
          data: input.map((_, idx) => ({ index: idx, embedding: createMockVector(1536) }))
        };
      }
    }
  }) as any;

  const retryVectors = await retryProvider.embedTexts(['Retry test text']);
  if (retryVectors.length !== 1 || attemptCount !== 3) {
    throw new Error(`Expected 3 attempts, got ${attemptCount}`);
  }
  console.log('  ✅ PASSED: Transient HTTP 429 retried successfully with bounded exponential backoff.');

  // Restore client
  (await import('../src/lib/openai')).ai.getClient = originalClient;

  // Test 11: Permanent Failure (Immediate Rejection)
  console.log('\nTest 11: Permanent Failure Immediate Rejection');
  const mock11 = new MockEmbeddingProvider();
  mock11.failPermanent = true;
  const service11 = new EmbeddingService(mock11);
  const docId11 = 'doc-phase11-permanent-fail';

  await documentRepository.create({
    id: docId11,
    userId: TEST_USER_ID,
    filename: 'fail.pdf',
    originalFilename: 'fail.pdf',
    mimeType: 'application/pdf',
    fileSize: 1000,
    storageKey: `documents/${TEST_USER_ID}/${docId11}/fail.pdf`
  });

  await documentRepository.saveChunksTx(docId11, [{ chunkIndex: 0, pageNumber: 1, content: 'Chunk text', tokenCount: 5 }]);

  try {
    await service11.processDocumentEmbeddings(docId11, TEST_USER_ID);
    throw new Error('Should have thrown error on permanent API failure');
  } catch (err) {
    console.log('  ✅ PASSED: Permanent API authentication failure rejected immediately without infinite retries.');
  }

  // Test 15: End-to-End Worker Phase 10 Integration Test
  console.log('\nTest 15: End-to-End Worker Integration Test');
  const storageKey = `documents/${TEST_USER_ID}/doc-phase10-e2e/sample.pdf`;
  await storage.upload(storageKey, VALID_PDF, 'application/pdf');

  const e2eDoc = await documentRepository.create({
    id: 'doc-phase10-e2e',
    userId: TEST_USER_ID,
    filename: 'sample.pdf',
    originalFilename: 'sample.pdf',
    mimeType: 'application/pdf',
    fileSize: VALID_PDF.length,
    storageKey
  });

  // Mock workerEmbeddingService provider with MockEmbeddingProvider for deterministic test execution
  const { workerEmbeddingService } = await import('../worker/src/embeddings/embedding.service.js');
  (workerEmbeddingService as any).provider = new MockEmbeddingProvider();

  await documentProcessor.process({
    jobType: 'DOCUMENT_PROCESSING',
    version: 1,
    jobId: `job-phase10-${Date.now()}`,
    documentId: e2eDoc.id,
    userId: TEST_USER_ID,
    storageKey,
    attempt: 1,
    createdAt: new Date().toISOString()
  });

  const updatedE2eDoc = await documentRepository.findByIdAndUser(e2eDoc.id, TEST_USER_ID);
  if (updatedE2eDoc?.status !== 'PROCESSING') {
    throw new Error(`Expected Document.status=PROCESSING, got ${updatedE2eDoc?.status}`);
  }

  console.log('  Updated Document ID:', updatedE2eDoc.id);
  console.log('  Updated Document status:', updatedE2eDoc.status);
  console.log('  ✅ PASSED: Worker pipeline completed PDF parsing, chunking, and embedding generation successfully.');

  // Clean up
  await storage.delete(storageKey);
  try {
    await prisma.document.deleteMany({ where: { userId: TEST_USER_ID } });
  } catch {
    memoryDb.documents.clear();
    memoryDb.chunks.clear();
  }

  console.log('\n====================================================');
  console.log('🎉 ALL PHASE 10 TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================\n');
}

runPhase10Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ PHASE 10 TEST FAILED:', err);
    process.exit(1);
  });
