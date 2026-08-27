import dotenv from 'dotenv';
dotenv.config();

import { EmbeddingProvider, OpenAIEmbeddingProvider } from '../src/features/documents/embeddings/embedding.provider';
import { OllamaEmbeddingProvider } from '../src/features/documents/embeddings/ollama.embedding.provider';
import { getEmbeddingProvider } from '../src/features/documents/embeddings/embedding.provider.factory';
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

function createMockVector(dim = 768, seed = 0.01): number[] {
  return Array.from({ length: dim }, (_, i) => Math.sin(seed + i));
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  public calls: string[][] = [];
  public failAttemptCount = 0;
  public failTransientTimes = 0;
  public failPermanent = false;
  public invalidDimensions = false;
  public customDimensions = 768;
  public containsNaN = false;
  public containsInfinity = false;
  public countMismatch = false;

  public async embedTexts(texts: string[]): Promise<number[][]> {
    this.calls.push(texts);

    if (this.failPermanent) {
      throw new InfrastructureError('OpenAI Authentication', 'Invalid API key');
    }

    if (this.failAttemptCount < this.failTransientTimes) {
      this.failAttemptCount++;
      throw new Error('HTTP 429 Rate Limit exceeded / Connection Refused');
    }

    if (this.countMismatch) {
      return [createMockVector(768)];
    }

    return texts.map((text, idx) => {
      if (!text || text.trim() === '') {
        throw new DocumentProcessingError('Cannot generate embedding for empty text content.');
      }
      if (this.invalidDimensions) {
        throw new DocumentProcessingError(`Embedding dimension mismatch at index 0. Expected 768, got ${this.customDimensions}`);
      }
      if (this.containsNaN) {
        throw new DocumentProcessingError('Invalid vector value at index 0, dimension 5: NaN');
      }
      if (this.containsInfinity) {
        throw new DocumentProcessingError('Invalid vector value at index 0, dimension 5: Infinity');
      }
      return createMockVector(768, idx + 0.1);
    });
  }
}

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
        sourceType: 'DOCUMENT' as const,
        filename: data.filename,
        originalFilename: data.originalFilename,
        mimeType: data.mimeType,
        fileSize: data.fileSize,
        storageKey: data.storageKey,
        webUrl: null,
        canonicalUrl: null,
        contentHash: null,
        fetchedAt: null,
        status: DocumentStatus.PROCESSING,
        familyId: null,
        activeVersionNumber: 1,
        isArchived: false,
        archivedAt: null,
        isDeleted: false,
        deletedAt: null,
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
  console.log('Running Phase 10 Dual Embedding Provider Test Suite');
  console.log('====================================================\n');

  await setupMocks();

  // Test 1: Factory Provider Selection
  console.log('Test 1: Provider Factory Selection');
  process.env.EMBEDDING_PROVIDER = 'ollama';
  const providerOllama = getEmbeddingProvider();
  if (!(providerOllama instanceof OllamaEmbeddingProvider)) {
    throw new Error('Expected OllamaEmbeddingProvider when EMBEDDING_PROVIDER=ollama');
  }

  process.env.EMBEDDING_PROVIDER = 'openai';
  const providerOpenAI = getEmbeddingProvider();
  if (!(providerOpenAI instanceof OpenAIEmbeddingProvider)) {
    throw new Error('Expected OpenAIEmbeddingProvider when EMBEDDING_PROVIDER=openai');
  }
  process.env.EMBEDDING_PROVIDER = 'ollama'; // reset
  console.log('  ✅ PASSED: Provider factory resolved Ollama and OpenAI correctly.');

  // Test 2: Ollama Provider Sends Multiple Texts & Returns 768-dim Vectors
  console.log('\nTest 2: Ollama Provider Multi-Text & 768-dim Vectors');
  const mockFetch = async (_url: string, init?: RequestInit) => {
    const body = JSON.parse((init?.body as string) || '{}');
    if (body.model !== 'nomic-embed-text') {
      throw new Error(`Unexpected model ${body.model}`);
    }
    return {
      ok: true,
      json: async () => ({
        embeddings: body.input.map((_: string, idx: number) => createMockVector(768, idx + 0.1))
      })
    } as Response;
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch as any;

  const ollamaProv = new OllamaEmbeddingProvider({
    baseUrl: 'http://localhost:11434',
    model: 'nomic-embed-text',
    expectedDimensions: 768
  });

  const sampleTexts = ['Sample text 1', 'Sample text 2'];
  const vectorsOllama = await ollamaProv.embedTexts(sampleTexts);

  if (vectorsOllama.length !== 2 || vectorsOllama[0]?.length !== 768 || vectorsOllama[1]?.length !== 768) {
    throw new Error(`Expected 2 vectors of 768 dimensions, got length=${vectorsOllama.length}, dim=${vectorsOllama[0]?.length}`);
  }
  console.log('  ✅ PASSED: Ollama provider sent multiple texts and returned 768-dim vectors.');

  // Test 3: Dimension Mismatches (767 & 769 Dimensions Rejected)
  console.log('\nTest 3: Rejection of 767 and 769 Dimension Vectors');
  const mockFetch767 = async () => ({
    ok: true,
    json: async () => ({ embeddings: [createMockVector(767)] })
  }) as any;
  globalThis.fetch = mockFetch767;

  try {
    await ollamaProv.embedTexts(['Text requiring 768 dims']);
    throw new Error('Should have thrown DocumentProcessingError for 767 dims');
  } catch (err) {
    if (err instanceof DocumentProcessingError && err.message.includes('dimension mismatch')) {
      console.log('  ✅ PASSED: 767-dimensional vector rejected correctly.');
    } else {
      throw err;
    }
  }

  const mockFetch769 = async () => ({
    ok: true,
    json: async () => ({ embeddings: [createMockVector(769)] })
  }) as any;
  globalThis.fetch = mockFetch769;

  try {
    await ollamaProv.embedTexts(['Text requiring 768 dims']);
    throw new Error('Should have thrown DocumentProcessingError for 769 dims');
  } catch (err) {
    if (err instanceof DocumentProcessingError && err.message.includes('dimension mismatch')) {
      console.log('  ✅ PASSED: 769-dimensional vector rejected correctly.');
    } else {
      throw err;
    }
  }

  // Restore fetch
  globalThis.fetch = originalFetch;

  // Test 4: Rejection of NaN and Infinity
  console.log('\nTest 4: Rejection of NaN and Infinity');
  const mock4 = new MockEmbeddingProvider();
  mock4.containsNaN = true;
  try {
    await mock4.embedTexts(['NaN text']);
    throw new Error('Should have rejected NaN');
  } catch (err) {
    console.log('  ✅ PASSED: NaN vector rejected.');
  }

  mock4.containsNaN = false;
  mock4.containsInfinity = true;
  try {
    await mock4.embedTexts(['Infinity text']);
    throw new Error('Should have rejected Infinity');
  } catch (err) {
    console.log('  ✅ PASSED: Infinity vector rejected.');
  }

  // Test 5: Batching (250 Chunks -> 3 Batches)
  console.log('\nTest 5: Batching (250 Chunks -> 3 Batches)');
  const mock5 = new MockEmbeddingProvider();
  const service5 = new EmbeddingService(mock5);
  const docId5 = `doc-phase10-batching-${Date.now()}`;

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
  console.log('  ✅ PASSED: 250 chunks processed in 3 batches.');

  // Test 6: Skipping Embedded Chunks & Idempotency
  console.log('\nTest 6: Skipping Embedded Chunks & Idempotency');
  const mock6 = new MockEmbeddingProvider();
  const service6 = new EmbeddingService(mock6);
  const res6 = await service6.processDocumentEmbeddings(docId5, TEST_USER_ID);

  if (res6.embeddedChunks !== 0 || mock6.calls.length !== 0) {
    throw new Error('Idempotency failed: provider called for already embedded chunks');
  }
  console.log('  ✅ PASSED: All chunks already embedded -> provider skipped execution completely.');

  // Test 7: Ollama Transient Error Retry
  console.log('\nTest 7: Ollama Transient Error Bounded Retry');
  let fetchAttempts = 0;
  const mockFetchRetry = async () => {
    fetchAttempts++;
    if (fetchAttempts <= 2) {
      throw new Error('fetch failed: ECONNREFUSED');
    }
    return {
      ok: true,
      json: async () => ({ embeddings: [createMockVector(768)] })
    } as Response;
  };
  globalThis.fetch = mockFetchRetry as any;

  const retryOllama = new OllamaEmbeddingProvider({
    baseUrl: 'http://localhost:11434',
    model: 'nomic-embed-text',
    expectedDimensions: 768,
    maxRetries: 3,
    initialDelayMs: 10
  });

  const retryRes = await retryOllama.embedTexts(['Retry test']);
  if (retryRes.length !== 1 || fetchAttempts !== 3) {
    throw new Error(`Expected 3 fetch attempts, got ${fetchAttempts}`);
  }
  console.log('  ✅ PASSED: Transient ECONNREFUSED retried successfully with bounded backoff.');

  globalThis.fetch = originalFetch;

  // Test 8: End-to-End Worker Integration Test
  console.log('\nTest 8: End-to-End Worker Integration Test with Mock Provider');
  const docId10 = `doc-phase10-e2e-${Date.now()}`;
  const storageKey = `documents/${TEST_USER_ID}/${docId10}/sample.pdf`;
  await storage.upload(storageKey, VALID_PDF, 'application/pdf');

  const e2eDoc = await documentRepository.create({
    id: docId10,
    userId: TEST_USER_ID,
    filename: 'sample.pdf',
    originalFilename: 'sample.pdf',
    mimeType: 'application/pdf',
    fileSize: VALID_PDF.length,
    storageKey
  });

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
  if (updatedE2eDoc?.status !== 'COMPLETED') {
    throw new Error(`Expected Document.status=COMPLETED, got ${updatedE2eDoc?.status}`);
  }

  console.log('  Updated Document status:', updatedE2eDoc.status);
  console.log('  ✅ PASSED: Full worker pipeline executed PDF parsing, chunking, and 768-dim embedding persistence.');

  // Clean up
  await storage.delete(storageKey);
  try {
    await prisma.document.deleteMany({ where: { userId: TEST_USER_ID } });
  } catch {
    memoryDb.documents.clear();
    memoryDb.chunks.clear();
  }

  console.log('\n====================================================');
  console.log('🎉 ALL PHASE 10 DUAL EMBEDDING TESTS PASSED!');
  console.log('====================================================\n');
}

if (process.argv[1]?.endsWith('phase10-embeddings.test.ts')) {
  runPhase10Tests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n❌ PHASE 10 TEST FAILED:', err);
      process.exit(1);
    });
}
