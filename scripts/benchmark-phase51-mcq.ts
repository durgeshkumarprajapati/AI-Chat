import { mockTestGeneratorService } from '../src/features/mock-tests/mock-test-generator.service';
import { mockTestSessionService } from '../src/features/mock-tests/mock-test-session.service';
import { MockTestGeneratedQuestionSchema } from '../src/features/mock-tests/mock-test.types';

async function runBenchmark() {
  console.log('=== Running Phase 51 AI MCQ Generation & Config Benchmark ===');

  const runs = 1000;
  const sampleQuestion = {
    questionText: 'Which data structure enforces FIFO (First-In, First-Out) ordering?',
    type: 'MCQ_SINGLE',
    options: [
      { id: 'A', optionText: 'Queue', isCorrect: true },
      { id: 'B', optionText: 'Stack', isCorrect: false },
      { id: 'C', optionText: 'Heap', isCorrect: false },
      { id: 'D', optionText: 'Graph', isCorrect: false }
    ],
    correctOptionId: 'A',
    explanation: 'A Queue adds elements at tail and removes from head (FIFO).',
    difficulty: 'EASY',
    evidenceIds: ['doc_data_struct']
  };

  // Benchmark 1: Zod Schema Validation
  const startSchema = performance.now();
  for (let i = 0; i < runs; i++) {
    MockTestGeneratedQuestionSchema.safeParse(sampleQuestion);
  }
  const schemaDuration = performance.now() - startSchema;
  console.log(`Zod MCQ Schema Validation: ${runs} runs in ${schemaDuration.toFixed(2)}ms (${(schemaDuration / runs).toFixed(4)}ms / run)`);

  // Benchmark 2: Exact Matching & Hashing
  const startHash = performance.now();
  for (let i = 0; i < runs; i++) {
    mockTestGeneratorService.generateQuestionHash(sampleQuestion.questionText);
  }
  const hashDuration = performance.now() - startHash;
  console.log(`SHA-256 Fingerprint Hashing: ${runs} runs in ${hashDuration.toFixed(2)}ms (${(hashDuration / runs).toFixed(4)}ms / run)`);

  // Benchmark 3: Question Normalization
  const legacyQuestion = {
    question: 'What is FIFO?',
    options: ['Queue', 'Stack', 'Heap', 'Graph'],
    correctOptionIndex: 0
  };
  const startNorm = performance.now();
  for (let i = 0; i < runs; i++) {
    mockTestSessionService.normalizeQuestion(legacyQuestion, 0);
  }
  const normDuration = performance.now() - startNorm;
  console.log(`Question Normalizer: ${runs} runs in ${normDuration.toFixed(2)}ms (${(normDuration / runs).toFixed(4)}ms / run)`);

  if (schemaDuration / runs < 0.1 && hashDuration / runs < 0.1 && normDuration / runs < 0.1) {
    console.log('✅ BENCHMARK PASSED: Phase 51 MCQ Validation, Hashing, and Normalization are under target (<0.1ms).');
  } else {
    console.error('❌ BENCHMARK FAILED: Performance target exceeded.');
    process.exit(1);
  }
}

runBenchmark().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
