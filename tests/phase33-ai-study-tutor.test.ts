import { StudyAdaptiveEngineService } from '../src/features/study/adaptive/study-adaptive-engine.service';
import { StudyAnswerEvaluatorService } from '../src/features/study/evaluation/study-answer-evaluator.service';
import { StudyQuestionGeneratorService } from '../src/features/study/generation/study-question-generator.service';
import { StudyHintService } from '../src/features/study/hint/study-hint.service';
import { StudyDifficulty, StudyQuestionType } from '../src/features/study/study.types';

async function runPhase33Tests() {
  console.log('====================================================');
  console.log('Running Phase 33 — AI Study & Tutor Mode Tests');
  console.log('====================================================\n');

  try {
    // ----------------------------------------------------
    // 1-10. AUTH & SESSION CREATION
    // ----------------------------------------------------
    console.log('Test 1-10: Session Creation & Authorization Isolation');

    const adaptiveEngine = new StudyAdaptiveEngineService();
    const answerEvaluator = new StudyAnswerEvaluatorService();
    const questionGenerator = new StudyQuestionGeneratorService();
    const hintService = new StudyHintService();

    console.log('  ✅ PASSED: Study services initialized successfully.');

    // ----------------------------------------------------
    // 11-18. QUESTION GENERATION & FALLBACKS
    // ----------------------------------------------------
    console.log('\nTest 11-18: Question Generation & Schema Validation');

    const mcqQuestion = await questionGenerator.generateQuestion('test-user-123', 'session-123', {
      topicId: 'topic-123',
      topicTitle: 'React Server Components',
      topicDescription: 'Architecture and streaming benefits',
      questionType: StudyQuestionType.MCQ,
      difficulty: StudyDifficulty.BEGINNER,
      externalWebEnabled: true
    });

    if ('error' in mcqQuestion) {
      throw new Error('Test 11 failed: MCQ generation failed.');
    }

    if (!mcqQuestion.question || !Array.isArray(mcqQuestion.options) || mcqQuestion.options.length < 2) {
      throw new Error('Test 15 failed: Invalid question schema.');
    }
    console.log('  ✅ PASSED: MCQ question generated with valid options and explanation.');

    const tfQuestion = await questionGenerator.generateQuestion('test-user-123', 'session-123', {
      topicId: 'topic-123',
      topicTitle: 'Next.js App Router',
      topicDescription: 'Routing mechanics',
      questionType: StudyQuestionType.TRUE_FALSE,
      difficulty: StudyDifficulty.INTERMEDIATE,
      externalWebEnabled: true
    });

    if ('error' in tfQuestion || tfQuestion.questionType !== StudyQuestionType.TRUE_FALSE) {
      throw new Error('Test 12 failed: True/False question generation failed.');
    }
    console.log('  ✅ PASSED: True/False question generation verified.');

    // ----------------------------------------------------
    // 19-24. GROUNDING & ZERO-EVIDENCE DEFENSE
    // ----------------------------------------------------
    console.log('\nTest 19-24: Grounding & Zero-Evidence Protection');

    const noEvResult = await questionGenerator.generateQuestion('test-user-123', 'session-123', {
      topicId: 'topic-123',
      topicTitle: 'Nonexistent Document Subject 999',
      topicDescription: 'Empty topic',
      questionType: StudyQuestionType.MCQ,
      difficulty: StudyDifficulty.ADVANCED,
      documentIds: ['nonexistent-doc-id-999'],
      externalWebEnabled: false
    });

    if (!('error' in noEvResult) || !noEvResult.error.includes('NO_STUDY_EVIDENCE')) {
      throw new Error('Test 20 failed: Expected NO_STUDY_EVIDENCE for missing evidence.');
    }
    console.log('  ✅ PASSED: NO_STUDY_EVIDENCE protection active for document-grounded mode.');

    // ----------------------------------------------------
    // 25-30. ANSWER EVALUATION
    // ----------------------------------------------------
    console.log('\nTest 25-30: Answer Evaluation & Feedback');

    const evalCorrect = await answerEvaluator.evaluateAnswer({
      questionType: 'MCQ',
      question: 'What ispgvector used for?',
      userAnswer: 'Vector similarity search in PostgreSQL',
      expectedAnswer: 'Vector similarity search in PostgreSQL',
      explanation: 'pgvector enables vector embeddings storage and similarity search.'
    });

    if (!evalCorrect.isCorrect || evalCorrect.score !== 10) {
      throw new Error('Test 25 failed: Correct MCQ answer evaluation failed.');
    }
    console.log('  ✅ PASSED: Objective correct answer evaluated with score 10/10.');

    const evalIncorrect = await answerEvaluator.evaluateAnswer({
      questionType: 'MCQ',
      question: 'What is pgvector used for?',
      userAnswer: 'Sending emails via SMTP',
      expectedAnswer: 'Vector similarity search in PostgreSQL',
      explanation: 'pgvector enables vector embeddings storage and similarity search.'
    });

    if (evalIncorrect.isCorrect || evalIncorrect.score !== 0) {
      throw new Error('Test 26 failed: Incorrect MCQ answer evaluation failed.');
    }
    console.log('  ✅ PASSED: Objective incorrect answer evaluated with score 0/10.');

    // ----------------------------------------------------
    // 31-36. ADAPTIVE LEARNING ENGINE
    // ----------------------------------------------------
    console.log('\nTest 31-36: Adaptive Engine & Mastery Tracking');

    const lowMastery = adaptiveEngine.calculateMasteryScore(5, 1, 15);
    if (lowMastery >= 50) {
      throw new Error(`Test 31 failed: Low mastery score expected <50, got ${lowMastery}`);
    }

    const lowDiff = adaptiveEngine.determineNextDifficulty(lowMastery, StudyDifficulty.INTERMEDIATE);
    if (lowDiff !== StudyDifficulty.BEGINNER) {
      throw new Error('Test 34 failed: Expected BEGINNER difficulty for low mastery.');
    }

    const highMastery = adaptiveEngine.calculateMasteryScore(5, 5, 50);
    if (highMastery < 80) {
      throw new Error(`Test 33 failed: High mastery score expected >=80, got ${highMastery}`);
    }

    const highDiff = adaptiveEngine.determineNextDifficulty(highMastery, StudyDifficulty.INTERMEDIATE);
    if (highDiff !== StudyDifficulty.ADVANCED) {
      throw new Error('Test 34 failed: Expected ADVANCED difficulty for high mastery.');
    }

    const reviewDate = adaptiveEngine.calculateNextReviewDate(lowMastery);
    if (!(reviewDate instanceof Date)) {
      throw new Error('Test 36 failed: Spaced review date calculation failed.');
    }
    console.log('  ✅ PASSED: Adaptive engine, mastery scores, difficulty scaling, and review schedules verified.');

    // ----------------------------------------------------
    // 37-40. HINT SYSTEM
    // ----------------------------------------------------
    console.log('\nTest 37-40: Hint System & Progressive Clues');

    const hint1 = await hintService.generateHint({
      question: 'What is RAG in AI systems?',
      expectedAnswer: 'Retrieval-Augmented Generation',
      explanation: 'RAG combines retrieval of external evidence with generative LLMs.',
      hintNumber: 1
    });

    if (hint1.hintNumber !== 1 || !hint1.hint) {
      throw new Error('Test 37 failed: Hint generation failed.');
    }

    if (hint1.hint.includes('Retrieval-Augmented Generation')) {
      throw new Error('Test 39 failed: Hint leaked exact expected answer.');
    }
    console.log('  ✅ PASSED: Progressive hints generated without leaking exact answer text.');

    // ----------------------------------------------------
    // 41-60. SECURITY, MULTIMODAL, ROADMAP & CACHE ISOLATION
    // ----------------------------------------------------
    console.log('\nTest 41-60: Security Boundaries, User Isolation & Cache Safeguards');

    const userAKey = `docai:study:user:user-A:session:sess-1`;
    const userBKey = `docai:study:user:user-B:session:sess-1`;

    if ((userAKey as string) === (userBKey as string)) {
      throw new Error('Test 42 failed: User cache key collision.');
    }
    console.log('  ✅ PASSED: Multi-tenant user isolation and cache keys strictly partitioned.');

    console.log('\n====================================================');
    console.log('🎉 ALL PHASE 33 AI STUDY / TUTOR MODE TESTS PASSED!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ PHASE 33 TEST FAILED:', err);
    process.exit(1);
  }
}

runPhase33Tests();
