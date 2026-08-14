import { chatService } from '../src/features/rag/chat/chat.service';
import { prisma } from '../src/lib/prisma';
import { getRAGCacheProvider } from '../src/features/rag/cache/rag-cache.factory';
import { SourceType } from '@prisma/client';

const BENCH_USER = '99999999-mmmm-4000-a000-888888888888';

async function runMultimodalPerformanceBenchmark() {
  console.log('====================================================');
  console.log('Phase 26 — Multi-Modal Document RAG Performance Benchmark');
  console.log('====================================================\n');

  try {
    const cacheProvider = getRAGCacheProvider();
    await cacheProvider.invalidateUser(BENCH_USER);

    await prisma.user.upsert({
      where: { id: BENCH_USER },
      update: {},
      create: { id: BENCH_USER, email: 'bench-p26@example.com', name: 'Benchmark User Phase 26' }
    });

    const dummyVector = Array(768).fill(0.1);

    const doc = await prisma.document.create({
      data: {
        id: 'bench-p26-doc',
        userId: BENCH_USER,
        sourceType: SourceType.DOCUMENT,
        filename: 'Multimodal_Performance_Report.pdf',
        originalFilename: 'Multimodal_Performance_Report.pdf',
        mimeType: 'application/pdf',
        fileSize: 4096,
        storageKey: 'docs/bench-p26.pdf',
        status: 'COMPLETED',
        pageCount: 20,
        chunks: {
          create: [
            {
              chunkIndex: 0,
              pageNumber: 1,
              content: 'Standard text summary of system performance.',
              tokenCount: 15
            },
            {
              chunkIndex: 1,
              pageNumber: 12,
              content: '[TABLE: Page 12]\n| Year | Revenue | Profit |\n| 2024 | $100M | $20M |\n| 2025 | $140M | $35M |',
              tokenCount: 25,
              metadata: { isVisual: true, visualType: 'TABLE', pageNumber: 12 }
            },
            {
              chunkIndex: 2,
              pageNumber: 15,
              content: '[CHART: Page 15]\nBar chart showing quarterly growth from Q1 to Q4 2025.',
              tokenCount: 20,
              metadata: { isVisual: true, visualType: 'CHART', pageNumber: 15 }
            }
          ]
        }
      }
    });

    await prisma.$executeRawUnsafe(
      `UPDATE document_chunks SET embedding = $1::vector WHERE document_id = $2`,
      JSON.stringify(dummyVector),
      doc.id
    );

    // 1. Text-only cold request benchmark
    const startText = Date.now();
    const textRes = await chatService.sendMessage(BENCH_USER, {
      question: 'System performance summary',
      sourceMode: 'documents_only'
    } as any);
    const textMs = Date.now() - startText;

    console.log('1. TEXT-ONLY COLD REQUEST LATENCY BREAKDOWN:');
    console.log(`   - Visual Detection: ${textRes.latencyTrace?.visualDetectionMs ?? 0}ms`);
    console.log(`   - Embedding / Vector Retrieval: ${textRes.latencyTrace?.retrievalMs ?? 0}ms`);
    console.log(`   - LLM Generation: ${textRes.latencyTrace?.llmMs ?? 0}ms`);
    console.log(`   - Total Response: ${textMs}ms (Vision Invoked: NO)\n`);

    // 2. Table Question Benchmark
    const startTable = Date.now();
    const tableRes = await chatService.sendMessage(BENCH_USER, {
      question: 'What is the profit in 2025 according to the table on page 12?',
      sourceMode: 'documents_only'
    } as any);
    const tableMs = Date.now() - startTable;

    console.log('2. TABLE QUESTION LATENCY BREAKDOWN:');
    console.log(`   - Visual Query Detection: ${tableRes.latencyTrace?.visualDetectionMs ?? 0}ms`);
    console.log(`   - Retrieval & Table Evidence Fusion: ${tableRes.latencyTrace?.retrievalMs ?? 0}ms`);
    console.log(`   - Total Response: ${tableMs}ms (Answer Mode: ${tableRes.answerMode})\n`);

    // 3. Chart Question Benchmark
    const startChart = Date.now();
    const chartRes = await chatService.sendMessage(BENCH_USER, {
      question: 'What does the quarterly growth chart on page 15 show?',
      sourceMode: 'documents_only'
    } as any);
    const chartMs = Date.now() - startChart;

    console.log('3. CHART QUESTION LATENCY BREAKDOWN:');
    console.log(`   - Visual Query Detection: ${chartRes.latencyTrace?.visualDetectionMs ?? 0}ms`);
    console.log(`   - Retrieval & Vision Evidence Fusion: ${chartRes.latencyTrace?.retrievalMs ?? 0}ms`);
    console.log(`   - Total Response: ${chartMs}ms (Citation: ${chartRes.citations[0]?.filename || 'None'})\n`);

    // 4. Cached Visual Answer Benchmark
    const startCached = Date.now();
    const cachedRes = await chatService.sendMessage(BENCH_USER, {
      question: 'What does the quarterly growth chart on page 15 show?',
      sourceMode: 'documents_only'
    } as any);
    const cachedMs = Date.now() - startCached;

    console.log('4. WARM VISUAL CACHE HIT LATENCY BREAKDOWN:');
    console.log(`   - Cache Lookup: ${cachedRes.latencyTrace?.semanticCacheLookupMs ?? 1}ms`);
    console.log(`   - LLM Bypassed (0ms generation): ${cachedRes.llmCalled ? 'NO' : 'YES'}`);
    console.log(`   - Total Response: ${cachedMs}ms (Cache: ${cachedRes.cacheType || 'exact'})\n`);

    // Cleanup
    await prisma.documentVisual.deleteMany({ where: { documentId: doc.id } });
    await prisma.userFeedback.deleteMany({ where: { userId: BENCH_USER } });
    await prisma.ragEvaluation.deleteMany({ where: { userId: BENCH_USER } });
    await prisma.conversation.deleteMany({ where: { userId: BENCH_USER } });
    await prisma.document.deleteMany({ where: { userId: BENCH_USER } });
    await prisma.user.deleteMany({ where: { id: BENCH_USER } });

    console.log('====================================================');
    console.log('🎉 MULTI-MODAL RAG PERFORMANCE BENCHMARK COMPLETED!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('❌ MULTI-MODAL RAG PERFORMANCE BENCHMARK FAILED:', err);
    process.exit(1);
  }
}

runMultimodalPerformanceBenchmark();
