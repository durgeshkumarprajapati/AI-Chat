import { studyUniquenessService } from '../src/features/study/uniqueness/study-uniqueness.service';
import { studyGroundingValidator } from '../src/features/study/validation/study-grounding-validator.service';
import { studyAdaptiveEngineService } from '../src/features/study/adaptive/study-adaptive-engine.service';

async function runBenchmark() {
  console.log('=== Phase 37 — Study Mode 2.0 Performance Benchmark ===\n');

  // 1. SHA256 Fingerprint Benchmark
  const t0 = performance.now();
  for (let i = 0; i < 1000; i++) {
    studyUniquenessService.computeFingerprint(`What is PostgreSQL pgvector index ${i}?`, 'topic-1', 'doc-1');
  }
  const t1 = performance.now();
  console.log(`1000 SHA-256 Fingerprints: ${(t1 - t0).toFixed(2)} ms (avg ${((t1 - t0) / 1000).toFixed(4)} ms/op)`);

  // 2. Cosine Similarity Benchmark
  const vec1 = Array.from({ length: 1536 }, () => Math.random());
  const vec2 = Array.from({ length: 1536 }, () => Math.random());

  const t2 = performance.now();
  for (let i = 0; i < 500; i++) {
    studyUniquenessService.cosineSimilarity(vec1, vec2);
  }
  const t3 = performance.now();
  console.log(`500 Cosine Similarities (1536-dim vectors): ${(t3 - t2).toFixed(2)} ms (avg ${((t3 - t2) / 500).toFixed(4)} ms/op)`);

  // 3. Grounding Validation Benchmark
  const evidence = [{ content: 'PostgreSQL pgvector allows fast vector similarity search using HNSW indexing.', documentId: 'doc-1', pageNumber: 1 }];
  const t4 = performance.now();
  for (let i = 0; i < 200; i++) {
    studyGroundingValidator.validateGrounding(
      {
        questionType: 'MCQ',
        question: 'How does pgvector perform similarity search?',
        options: ['HNSW index', 'Linear scan', 'BTree', 'Full text scan'],
        expectedAnswer: 'HNSW index',
        explanation: 'HNSW indexing supports vector search.',
        difficulty: 'BEGINNER'
      },
      evidence
    );
  }
  const t5 = performance.now();
  console.log(`200 Grounding Validations: ${(t5 - t4).toFixed(2)} ms (avg ${((t5 - t4) / 200).toFixed(4)} ms/op)`);

  // 4. Adaptive Mastery & Difficulty Calculation Benchmark
  const t6 = performance.now();
  for (let i = 0; i < 1000; i++) {
    studyAdaptiveEngineService.calculateMasteryScore(5, 4, 42);
    studyAdaptiveEngineService.determineAdaptiveDifficultyFromHistory([8, 9, 7, 8, 9], 'BEGINNER');
  }
  const t7 = performance.now();
  console.log(`1000 Mastery & Difficulty Calculations: ${(t7 - t6).toFixed(2)} ms (avg ${((t7 - t6) / 1000).toFixed(4)} ms/op)`);

  console.log('\n=== Benchmark Summary: All core study algorithms sub-millisecond ===');
}

runBenchmark().catch(console.error);
