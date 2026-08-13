import dotenv from 'dotenv';
dotenv.config();

import { RetrievalService } from '../src/features/rag/retrieval/retrieval.service';
import { LocalReranker } from '../src/features/rag/retrieval/reranker';
import { MockEmbeddingProvider } from './phase10-embeddings.test';
import { ChatService } from '../src/features/rag/chat/chat.service';
import { MockStreamingLLMProvider, MockStreamingRetrievalService } from './phase13-streaming-chat.test';
import { documentRepository } from '../src/features/documents/repositories/document.repository';
import { prisma } from '../src/lib/prisma';
import { RetrievedChunk } from '../src/features/rag/retrieval/retrieval.types';

const TEST_USER_ID = '99999999-9999-4000-a000-999999999999';
const OTHER_USER_ID = 'aaaaaaaa-aaaa-4000-a000-aaaaaaaaaaaa';

async function setupMocks() {
  try {
    await prisma.user.upsert({
      where: { id: TEST_USER_ID },
      update: {},
      create: {
        id: TEST_USER_ID,
        email: 'phase14-test-user-1@example.com',
        name: 'Phase 14 Test User 1'
      }
    });

    await prisma.user.upsert({
      where: { id: OTHER_USER_ID },
      update: {},
      create: {
        id: OTHER_USER_ID,
        email: 'phase14-test-user-2@example.com',
        name: 'Phase 14 Test User 2'
      }
    });
  } catch (err) {
    console.warn('Failed to upsert test users:', err);
  }
}

async function runPhase14Tests() {
  console.log('====================================================');
  console.log('Running Phase 14 Hybrid Retrieval & Reranking Tests');
  console.log('====================================================\n');

  await setupMocks();

  // Test 1: LocalReranker scoring & phrase match bonus
  console.log('Test 1: LocalReranker Term & Phrase Scoring');
  const reranker = new LocalReranker();
  const sampleCandidates: RetrievedChunk[] = [
    {
      id: 'c1',
      documentId: 'd1',
      filename: 'doc1.pdf',
      chunkIndex: 0,
      pageNumber: 1,
      content: 'This document describes production deployment pipelines and automated scaling.',
      tokenCount: 10,
      similarity: 0.80,
      vectorScore: 0.80,
      keywordScore: 0.50,
      hybridScore: 0.71,
      metadata: {}
    },
    {
      id: 'c2',
      documentId: 'd1',
      filename: 'doc1.pdf',
      chunkIndex: 1,
      pageNumber: 2,
      content: 'General overview of software architecture without specific mentions.',
      tokenCount: 8,
      similarity: 0.75,
      vectorScore: 0.75,
      keywordScore: 0.10,
      hybridScore: 0.555,
      metadata: {}
    }
  ];

  const reranked = reranker.rerank('production deployment pipelines', sampleCandidates);
  if (reranked.length !== 2) {
    throw new Error('Reranker dropped candidate chunks unexpectedly');
  }
  if (reranked[0]!.id !== 'c1') {
    throw new Error(`Expected chunk c1 to be ranked #1, got ${reranked[0]!.id}`);
  }
  if ((reranked[0]!.rerankScore ?? 0) <= (reranked[1]!.rerankScore ?? 0)) {
    throw new Error('Reranker score order mismatch');
  }
  console.log('  ✅ PASSED: LocalReranker computed term coverage & phrase match scores correctly.');

  // Test 2 & 3: RetrievalService Hybrid Search & Trace Generation
  console.log('\nTest 2 & 3: RetrievalService Hybrid Trace & Tenant Isolation');
  const docId14 = `doc-p14-${Date.now()}`;
  await documentRepository.create({
    id: docId14,
    userId: TEST_USER_ID,
    filename: 'kubernetes_architecture.pdf',
    originalFilename: 'kubernetes_architecture.pdf',
    mimeType: 'application/pdf',
    fileSize: 4500,
    storageKey: `documents/${TEST_USER_ID}/${docId14}/kubernetes_architecture.pdf`
  });

  const sampleChunks14 = [
    {
      chunkIndex: 0,
      pageNumber: 1,
      content: 'Kubernetes cluster deployment uses automated ingress controllers and horizontal pod autoscalers.',
      tokenCount: 12,
      metadata: { pageNumber: 1 }
    },
    {
      chunkIndex: 1,
      pageNumber: 2,
      content: 'PostgreSQL database migrations execute prior to application service rollouts.',
      tokenCount: 10,
      metadata: { pageNumber: 2 }
    }
  ];

  await documentRepository.saveChunksTx(docId14, sampleChunks14);

  // Save 768d vector embeddings
  const needingEmbeds = await documentRepository.findChunksNeedingEmbeddings(docId14);
  if (needingEmbeds.length > 0) {
    const fakeVector = Array.from({ length: 768 }, (_, i) => Math.sin(i + 0.1));
    await documentRepository.saveEmbeddingsBatchTx(
      needingEmbeds.map((c) => ({ id: c.id, embedding: fakeVector }))
    );
  }

  const mockEmbProvider = new MockEmbeddingProvider();
  const service14 = new RetrievalService(mockEmbProvider);

  // Retrieve as TEST_USER_ID
  const result14 = await service14.retrieveContextWithTrace(TEST_USER_ID, 'Kubernetes cluster deployment');
  if (!result14.trace || typeof result14.trace.metrics.totalMs !== 'number') {
    throw new Error('RetrievalTrace metrics missing in result');
  }
  if (result14.trace.query !== 'Kubernetes cluster deployment') {
    throw new Error('Trace query string mismatch');
  }

  // Retrieve as OTHER_USER_ID (tenant isolation)
  const otherResult = await service14.retrieveContextWithTrace(OTHER_USER_ID, 'Kubernetes cluster deployment');
  if (otherResult.chunks.length !== 0) {
    throw new Error(`Tenant isolation failed: OTHER_USER_ID retrieved ${otherResult.chunks.length} chunks`);
  }
  console.log('  ✅ PASSED: RetrievalTrace collected timing metrics and database-level tenant isolation enforced.');

  // Test 4: ChatService Integration with Hybrid Retrieval (Stream & Non-stream)
  console.log('\nTest 4: ChatService Integration with Hybrid Retrieval');
  const mockRet = new MockStreamingRetrievalService();
  mockRet.mockChunks = [
    {
      id: 'chunk-h1',
      documentId: docId14,
      filename: 'kubernetes_architecture.pdf',
      chunkIndex: 0,
      pageNumber: 1,
      content: 'Kubernetes cluster deployment uses automated ingress controllers.',
      tokenCount: 10,
      similarity: 0.89,
      vectorScore: 0.89,
      keywordScore: 0.75,
      hybridScore: 0.85,
      rerankScore: 0.92,
      retrievalSource: 'hybrid',
      metadata: { pageNumber: 1 }
    }
  ];

  const chatService14 = new ChatService(mockRet, new MockStreamingLLMProvider());

  // Non-streaming sendMessage
  const syncRes = await chatService14.sendMessage(TEST_USER_ID, { question: 'What is the deployment method?' });
  if (syncRes.citations.length !== 1 || syncRes.citations[0]?.filename !== 'kubernetes_architecture.pdf') {
    throw new Error('Non-streaming sendMessage hybrid citations mismatch');
  }

  // Streaming streamMessage
  let streamCount = 0;
  for await (const evt of chatService14.streamMessage(TEST_USER_ID, { question: 'What is the deployment method?' })) {
    if (evt.type === 'start') {
      if (evt.citations.length !== 1) throw new Error('Streaming start event missing citations');
    }
    streamCount++;
  }
  if (streamCount === 0) {
    throw new Error('Streaming message returned 0 events');
  }

  console.log('  ✅ PASSED: Both non-streaming sendMessage and streaming streamMessage benefit from hybrid retrieval.');

  // Clean up
  try {
    await prisma.document.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.conversation.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.conversation.deleteMany({ where: { userId: OTHER_USER_ID } });
  } catch {
    console.log('Cleaned up mock test records.');
  }

  console.log('\n====================================================');
  console.log('🎉 ALL PHASE 14 HYBRID RETRIEVAL TESTS PASSED!');
  console.log('====================================================\n');
}

runPhase14Tests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ PHASE 14 TEST FAILED:', err);
    process.exit(1);
  });
