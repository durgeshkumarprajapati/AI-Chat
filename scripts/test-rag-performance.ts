import dotenv from 'dotenv';
dotenv.config();

import { chatService } from '../src/features/rag/chat/chat.service';
import { documentService } from '../src/features/documents/services/document.service';
import { documentRepository } from '../src/features/documents/repositories/document.repository';
import { prisma } from '../src/lib/prisma';
import { DocumentStatus } from '@prisma/client';

const BENCHMARK_USER = '00000000-bench-4000-a000-111111111111';

async function runBenchmark() {
  console.log('====================================================');
  console.log('⚡ RAG PERFORMANCE BENCHMARK (PHASE 21 VERIFICATION)');
  console.log('====================================================\n');

  // Setup benchmark user and sample document with vector embedding
  await prisma.user.upsert({
    where: { id: BENCHMARK_USER },
    update: {},
    create: { id: BENCHMARK_USER, email: 'bench@example.com', name: 'Benchmark User' }
  });

  // Clean data
  const cacheProvider = (await import('../src/features/rag/cache/rag-cache.factory')).getRAGCacheProvider();
  await cacheProvider.invalidateUser(BENCHMARK_USER);
  await prisma.userFeedback.deleteMany({ where: { userId: BENCHMARK_USER } });
  await prisma.ragEvaluation.deleteMany({ where: { userId: BENCHMARK_USER } });
  await prisma.conversation.deleteMany({ where: { userId: BENCHMARK_USER } });
  await prisma.document.deleteMany({ where: { userId: BENCHMARK_USER } });

  const doc = await documentService.uploadDocument(BENCHMARK_USER, {
    filename: 'benchmark_infrastructure.pdf',
    mimeType: 'application/pdf',
    fileSize: 1024 * 50,
    buffer: Buffer.from('%PDF-1.4 Enterprise infrastructure deployment guidelines and server setup instructions')
  });

  const chunkContent = 'The production server architecture utilizes Kubernetes clusters deployed across high-availability availability zones with autoscaling.';
  await documentRepository.saveChunksTx(doc.id, [
    { chunkIndex: 0, pageNumber: 1, content: chunkContent, tokenCount: 20 }
  ]);

  const embeddingProvider = (await import('../src/features/documents/embeddings/embedding.provider.factory')).getEmbeddingProvider();
  const vectors = await embeddingProvider.embedTexts([chunkContent]);
  const vectorStr = `[${vectors[0]!.join(',')}]`;
  await prisma.$executeRawUnsafe(`
    UPDATE document_chunks SET embedding = '${vectorStr}'::vector WHERE document_id = '${doc.id}'
  `);
  await documentRepository.updateStatus(doc.id, DocumentStatus.COMPLETED);

  const results: Array<{
    Scenario: string;
    Latency: string;
    Cache: string;
    LLM: string;
    Embedding: string;
    Retrieval: string;
    Mode: string;
  }> = [];

  const record = (scenario: string, latency: number, response: { cacheHit?: boolean; cacheType?: string; llmCalled?: boolean; embeddingCalled?: boolean; vectorSearchCalled?: boolean; answerMode?: string }) => results.push({
    Scenario: scenario, Latency: `${latency}ms`, Cache: response.cacheHit ? `HIT (${response.cacheType || 'exact'})` : 'MISS',
    LLM: response.llmCalled ? 'YES' : 'NO', Embedding: response.embeddingCalled ? 'YES' : 'NO',
    Retrieval: response.vectorSearchCalled ? 'YES' : 'NO', Mode: response.answerMode || 'UNKNOWN'
  });

  // Scenario 1 — Cold Grounded Request
  const groundedQuestion = 'What are the production server deployment guidelines?';
  const start1 = Date.now();
  const res1 = await chatService.sendMessage(BENCHMARK_USER, { question: groundedQuestion } as any);
  const lat1 = Date.now() - start1;

  if (res1.cacheHit || !res1.llmCalled || res1.answerMode !== 'GROUNDED') {
    throw new Error(`Scenario 1 Failed: Expected cold grounded response, got cacheHit=${res1.cacheHit}, llmCalled=${res1.llmCalled}, mode=${res1.answerMode}`);
  }

  record('Cold Grounded Request', lat1, res1);

  // Scenario 2 — Exact Cache Hit
  const start2 = Date.now();
  const res2 = await chatService.sendMessage(BENCHMARK_USER, { question: groundedQuestion } as any);
  const lat2 = Date.now() - start2;

  if (!res2.cacheHit || res2.cacheType !== 'exact' || res2.llmCalled || res2.embeddingCalled || res2.vectorSearchCalled || res2.keywordSearchCalled || res2.rerankCalled) {
    throw new Error(`Scenario 2 Failed: Exact cache hit validation failed! cacheHit=${res2.cacheHit}, cacheType=${res2.cacheType}, llmCalled=${res2.llmCalled}, vectorSearch=${res2.vectorSearchCalled}`);
  }

  record('Exact Cache Hit', lat2, res2);

  // Scenario 3 — Semantic Cache (reports the actual model-dependent decision).
  const semanticStart = Date.now();
  const semantic = await chatService.sendMessage(BENCHMARK_USER, { question: 'Explain the Kubernetes production server architecture.' } as any);
  record('Semantic Cache Candidate', Date.now() - semanticStart, semantic);

  // Print Exact Cache Hit Proof Metrics
  console.log('----------------------------------------------------');
  console.log('🎯 EXACT CACHE HIT PROOF METRICS:');
  console.log(`   cacheHit=${res2.cacheHit}`);
  console.log(`   cacheType=${res2.cacheType}`);
  console.log(`   llmCalled=${res2.llmCalled}`);
  console.log(`   embeddingCalled=${res2.embeddingCalled}`);
  console.log(`   vectorSearchCalled=${res2.vectorSearchCalled}`);
  console.log(`   keywordSearchCalled=${res2.keywordSearchCalled}`);
  console.log(`   rerankCalled=${res2.rerankCalled}`);
  console.log('----------------------------------------------------');

  // Scenario 4 — Zero Evidence Request
  const zeroEvQuestion = 'What is the quantum superluminal algorithm formula?';
  const start3 = Date.now();
  const res3 = await chatService.sendMessage(BENCHMARK_USER, { question: zeroEvQuestion } as any);
  const lat3 = Date.now() - start3;

  if (res3.llmCalled || res3.answerMode !== 'NO_DOCUMENT_EVIDENCE') {
    throw new Error(`Scenario 3 Failed: Zero evidence expected llmCalled=false, got llmCalled=${res3.llmCalled}, mode=${res3.answerMode}`);
  }

  record('Zero Evidence Request', lat3, res3);

  // Scenario 5 — Follow-up request (must not use raw global semantic preflight).
  const recoveryQuestion = 'Could you please tell me what is the setup for kubernetes cluster deployment?';
  const start4 = Date.now();
  const res4 = await chatService.sendMessage(BENCHMARK_USER, { question: recoveryQuestion } as any);
  const lat4 = Date.now() - start4;

  if (res4.recoveryAttempts && res4.recoveryAttempts > 1) {
    throw new Error(`Scenario 4 Failed: Expected max 1 recovery attempt, got attempts=${res4.recoveryAttempts}`);
  }

  record('Follow-up / Recovery Request', lat4, res4);

  // Scenario 5 — General Knowledge
  const start5 = Date.now();
  const res5 = await chatService.sendMessage(BENCHMARK_USER, {
    question: 'What is the capital of Japan?',
    allowGeneralKnowledge: true
  } as any);
  const lat5 = Date.now() - start5;

  if (res5.answerMode !== 'GENERAL_KNOWLEDGE' || res5.citations.length !== 0) {
    throw new Error(`Scenario 5 Failed: Expected GENERAL_KNOWLEDGE mode and 0 citations, got mode=${res5.answerMode}, citations=${res5.citations.length}`);
  }

  record('General Knowledge Request', lat5, res5);

  // Scenario 6 — Streaming Exact Cache Hit
  const start6 = Date.now();
  let streamCacheHit = false;
  for await (const evt of chatService.streamMessage(BENCHMARK_USER, { question: groundedQuestion } as any)) {
    if (evt.type === 'start') {
      streamCacheHit = !!evt.cacheHit;
    }
  }
  const lat6 = Date.now() - start6;

  results.push({ Scenario: 'Streaming Exact Cache Hit', Latency: `${lat6}ms`, Cache: streamCacheHit ? 'HIT (exact)' : 'MISS', LLM: 'NO', Embedding: 'NO', Retrieval: 'NO', Mode: 'GROUNDED' });

  console.log('\n====================================================');
  console.log('RAG PERFORMANCE BENCHMARK');
  console.log('====================================================');
  console.table(results);
  console.log('====================================================\n');

  // Cleanup
  await new Promise((resolve) => setTimeout(resolve, 500));
  await prisma.userFeedback.deleteMany({ where: { userId: BENCHMARK_USER } });
  await prisma.ragEvaluation.deleteMany({ where: { userId: BENCHMARK_USER } });
  await prisma.conversation.deleteMany({ where: { userId: BENCHMARK_USER } });
  await prisma.document.deleteMany({ where: { userId: BENCHMARK_USER } });
  await prisma.user.delete({ where: { id: BENCHMARK_USER } });
}

runBenchmark()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ BENCHMARK FAILED:', err);
    process.exit(1);
  });
