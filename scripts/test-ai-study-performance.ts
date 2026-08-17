import { StudyAdaptiveEngineService } from '../src/features/study/adaptive/study-adaptive-engine.service';
import { StudyAnswerEvaluatorService } from '../src/features/study/evaluation/study-answer-evaluator.service';
import { StudyQuestionGeneratorService } from '../src/features/study/generation/study-question-generator.service';

async function benchmarkStudyPerformance() {
  console.log('====================================================');
  console.log('DOCUMENT AI RAG PLATFORM — AI STUDY PERFORMANCE BENCHMARK');
  console.log('====================================================\n');

  const questionGenerator = new StudyQuestionGeneratorService();
  const answerEvaluator = new StudyAnswerEvaluatorService();
  const adaptiveEngine = new StudyAdaptiveEngineService();

  // 1. Benchmark Topic Generation Latency
  const startTopic = Date.now();
  await questionGenerator.generateTopicsForScope('bench-user', {
    title: 'PostgreSQL Architecture',
    goal: 'DEEP_UNDERSTANDING',
    difficulty: 'INTERMEDIATE',
    count: 3
  });
  const topicLatency = Date.now() - startTopic;
  console.log(`⏱️ Topic Generation Latency: ${topicLatency} ms`);

  // 2. Benchmark Question Generation Latency
  const startQ = Date.now();
  await questionGenerator.generateQuestion('bench-user', {
    topicTitle: 'WAL Logging in Postgres',
    topicDescription: 'Write-ahead logging durability mechanism',
    questionType: 'MCQ',
    difficulty: 'INTERMEDIATE',
    externalWebEnabled: true
  });
  const questionLatency = Date.now() - startQ;
  console.log(`⏱️ Question Generation Latency: ${questionLatency} ms`);

  // 3. Benchmark Answer Evaluation Latency
  const startEval = Date.now();
  await answerEvaluator.evaluateAnswer({
    questionType: 'MCQ',
    question: 'What is WAL?',
    userAnswer: 'Write-ahead logging',
    expectedAnswer: 'Write-ahead logging',
    explanation: 'Ensures data integrity before flushing pages to disk.'
  });
  const evalLatency = Date.now() - startEval;
  console.log(`⏱️ Answer Evaluation Latency: ${evalLatency} ms`);

  // 4. Benchmark Adaptive Calculation Latency
  const startAdaptive = Date.now();
  adaptiveEngine.calculateMasteryScore(10, 8, 80);
  adaptiveEngine.calculateNextReviewDate(80);
  const adaptiveLatency = Date.now() - startAdaptive;
  console.log(`⏱️ Adaptive Calculation Latency: ${adaptiveLatency} ms`);

  console.log('\n====================================================');
  console.log('🎉 AI STUDY PERFORMANCE BENCHMARK COMPLETE!');
  console.log('====================================================\n');
}

benchmarkStudyPerformance();
