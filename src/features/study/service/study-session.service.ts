import { studyRepository } from '../repository/study.repository';
import { studyQuestionGeneratorService } from '../generation/study-question-generator.service';
import { studyAnswerEvaluatorService } from '../evaluation/study-answer-evaluator.service';
import { studyAdaptiveEngineService } from '../adaptive/study-adaptive-engine.service';
import { studyHintService } from '../hint/study-hint.service';
import { studyCacheService } from '../cache/study.cache';
import {
  CreateStudySessionInput,
  StudyGoal,
  StudyDifficulty,
  StudyLearningStyle,
  StudyMode,
  StudySessionStatus,
  StudyQuestionType
} from '../study.types';
import { prisma } from '@/lib/prisma';
import { NotFoundError, AuthorizationError, ValidationError } from '@/errors';

export class StudySessionService {
  public async createSession(userId: string, input: CreateStudySessionInput) {
    let title = input.title?.trim() || 'AI Study Session';
    let kbId = input.knowledgeBaseId || undefined;
    let roadmapId = input.roadmapId || undefined;
    const documentIds = input.documentIds || [];

    // Verify ownership/access of selected resources
    if (kbId) {
      const kb = await prisma.knowledgeBase.findFirst({
        where: { id: kbId, userId }
      });
      if (!kb) throw new AuthorizationError('Unauthorized access to Knowledge Base.');
      if (!input.title) title = `Study: ${kb.name}`;
    }

    if (roadmapId) {
      const rm = await prisma.roadmap.findFirst({
        where: { id: roadmapId, userId }
      });
      if (!rm) throw new AuthorizationError('Unauthorized access to Roadmap.');
      if (!input.title) title = `Study: ${rm.title}`;
    }

    const sourcesPayload: Array<{
      documentId?: string;
      knowledgeBaseId?: string;
      roadmapId?: string;
      sourceType: string;
    }> = [];

    if (kbId) sourcesPayload.push({ knowledgeBaseId: kbId, sourceType: 'KNOWLEDGE_BASE' });
    if (roadmapId) sourcesPayload.push({ roadmapId: roadmapId, sourceType: 'ROADMAP' });
    for (const docId of documentIds) {
      const doc = await prisma.document.findFirst({ where: { id: docId, userId } });
      if (doc) sourcesPayload.push({ documentId: docId, sourceType: 'DOCUMENT' });
    }

    const session = await studyRepository.createSession({
      userId,
      title,
      knowledgeBaseId: kbId,
      roadmapId,
      goal: input.goal || StudyGoal.DEEP_UNDERSTANDING,
      difficulty: input.difficulty || StudyDifficulty.BEGINNER,
      learningStyle: input.learningStyle || StudyLearningStyle.MIXED,
      durationMinutes: input.durationMinutes || 30,
      externalWebEnabled: !!input.externalWebEnabled,
      sources: sourcesPayload
    });

    return session;
  }

  public async startSession(userId: string, sessionId: string) {
    const session = await studyRepository.getSessionById(sessionId, userId);
    if (!session) throw new NotFoundError('Study session not found.');

    // Generate initial topics if none exist
    let topics = session.topics;
    if (topics.length === 0) {
      const generatedTopics = await studyQuestionGeneratorService.generateTopicsForScope(userId, {
        title: session.title,
        knowledgeBaseId: session.knowledgeBaseId || undefined,
        roadmapId: session.roadmapId || undefined,
        documentIds: session.sources.map((s) => s.documentId).filter(Boolean) as string[],
        goal: session.goal,
        difficulty: session.difficulty
      });

      topics = await studyRepository.createTopics(sessionId, generatedTopics) as any;
    }

    const firstTopic = topics[0];
    if (firstTopic && firstTopic.questions.length === 0) {
      const questionPayload = await studyQuestionGeneratorService.generateQuestion(userId, {
        topicTitle: firstTopic.title,
        topicDescription: firstTopic.description,
        questionType: session.currentMode === StudyMode.SOCRATIC ? StudyQuestionType.SHORT_ANSWER : StudyQuestionType.MCQ,
        difficulty: session.difficulty,
        knowledgeBaseId: session.knowledgeBaseId || undefined,
        documentIds: session.sources.map((s) => s.documentId).filter(Boolean) as string[],
        externalWebEnabled: session.externalWebEnabled
      });

      if ('error' in questionPayload) {
        throw new ValidationError('NO_STUDY_EVIDENCE: Selected study materials do not contain sufficient evidence.');
      }

      await studyRepository.createQuestion({
        topicId: firstTopic.id,
        questionType: questionPayload.questionType,
        question: questionPayload.question,
        options: questionPayload.options,
        expectedAnswer: questionPayload.expectedAnswer,
        explanation: questionPayload.explanation,
        difficulty: questionPayload.difficulty
      });
    }

    return this.getSessionDetails(userId, sessionId);
  }

  public async getSessionDetails(userId: string, sessionId: string) {
    const cached = await studyCacheService.get<any>(userId, `session:${sessionId}`);
    if (cached) return cached;

    const session = await studyRepository.getSessionById(sessionId, userId);
    if (!session) throw new NotFoundError('Study session not found.');

    // Anti-cheating: strip expectedAnswer from question payloads returned to client
    const sanitizedTopics = session.topics.map((topic) => ({
      ...topic,
      questions: topic.questions.map((q) => {
        const { expectedAnswer: _exp, ...rest } = q;
        return rest;
      })
    }));

    const result = {
      ...session,
      topics: sanitizedTopics
    };

    await studyCacheService.set(userId, `session:${sessionId}`, result, 300);
    return result;
  }

  public async getUserSessions(userId: string) {
    return studyRepository.getUserSessions(userId);
  }

  public async deleteSession(userId: string, sessionId: string) {
    const deleted = await studyRepository.deleteSession(sessionId, userId);
    if (!deleted) throw new NotFoundError('Study session not found.');
    await studyCacheService.invalidate(userId, `session:${sessionId}`);
    return true;
  }

  public async submitAnswer(
    userId: string,
    sessionId: string,
    params: { questionId: string; answer: string; hintsUsed?: number }
  ) {
    const session = await studyRepository.getSessionById(sessionId, userId);
    if (!session) throw new NotFoundError('Study session not found.');

    const question = await prisma.studyQuestion.findFirst({
      where: { id: params.questionId }
    });
    if (!question) throw new NotFoundError('Question not found.');

    const evaluation = await studyAnswerEvaluatorService.evaluateAnswer({
      questionType: question.questionType,
      question: question.question,
      userAnswer: params.answer,
      expectedAnswer: question.expectedAnswer,
      explanation: question.explanation,
      options: (question.options as string[]) || []
    });

    const savedAnswer = await studyRepository.saveAnswer({
      questionId: question.id,
      sessionId: session.id,
      userId,
      answer: params.answer,
      isCorrect: evaluation.isCorrect,
      score: evaluation.score,
      feedback: evaluation.feedback,
      hintsUsed: params.hintsUsed || 0
    });

    // Update topic mastery
    const topicAnswers = await prisma.studyAnswer.findMany({
      where: {
        sessionId: session.id,
        question: { topicId: question.topicId }
      }
    });

    const attempted = topicAnswers.length;
    const correct = topicAnswers.filter((a) => a.isCorrect).length;
    const totalScore = topicAnswers.reduce((sum, a) => sum + a.score, 0);

    const masteryScore = studyAdaptiveEngineService.calculateMasteryScore(attempted, correct, totalScore);
    const nextReviewAt = studyAdaptiveEngineService.calculateNextReviewDate(masteryScore);

    await studyRepository.updateTopicMastery(question.topicId, masteryScore);
    await studyRepository.upsertProgress({
      sessionId: session.id,
      topicId: question.topicId,
      attemptedQuestions: attempted,
      correctAnswers: correct,
      masteryScore,
      nextReviewAt
    });

    // Recalculate session overall progress
    const totalTopicsCount = session.topics.length;
    const completedTopicsCount = session.topics.filter((t) => t.masteryScore >= 80).length;
    const sessionProgressPercent = totalTopicsCount > 0 ? Math.round((completedTopicsCount / totalTopicsCount) * 100) : 0;

    await studyRepository.updateSessionProgress(session.id, sessionProgressPercent);
    await studyCacheService.invalidate(userId, `session:${sessionId}`);

    return {
      answerId: savedAnswer.id,
      isCorrect: evaluation.isCorrect,
      score: evaluation.score,
      feedback: evaluation.feedback,
      explanation: question.explanation,
      expectedAnswer: question.expectedAnswer,
      masteryScore,
      sessionProgressPercent
    };
  }

  public async getHint(userId: string, sessionId: string, questionId: string, hintNumber: number) {
    const session = await studyRepository.getSessionById(sessionId, userId);
    if (!session) throw new NotFoundError('Study session not found.');

    const question = await prisma.studyQuestion.findFirst({
      where: { id: questionId }
    });
    if (!question) throw new NotFoundError('Question not found.');

    return studyHintService.generateHint({
      question: question.question,
      expectedAnswer: question.expectedAnswer,
      explanation: question.explanation,
      hintNumber
    });
  }

  public async nextQuestion(userId: string, sessionId: string) {
    const session = await studyRepository.getSessionById(sessionId, userId);
    if (!session) throw new NotFoundError('Study session not found.');

    // Find first topic that needs questions or is in progress
    let currentTopic = session.topics.find((t) => t.masteryScore < 80) || session.topics[0];
    if (!currentTopic) throw new ValidationError('All topics in this study session are completed!');

    const questionPayload = await studyQuestionGeneratorService.generateQuestion(userId, {
      topicTitle: currentTopic.title,
      topicDescription: currentTopic.description,
      questionType: session.currentMode === StudyMode.SOCRATIC ? StudyQuestionType.SHORT_ANSWER : StudyQuestionType.MCQ,
      difficulty: session.difficulty,
      knowledgeBaseId: session.knowledgeBaseId || undefined,
      documentIds: session.sources.map((s) => s.documentId).filter(Boolean) as string[],
      externalWebEnabled: session.externalWebEnabled
    });

    if ('error' in questionPayload) {
      throw new ValidationError('NO_STUDY_EVIDENCE: Selected study materials do not contain sufficient evidence.');
    }

    const newQuestion = await studyRepository.createQuestion({
      topicId: currentTopic.id,
      questionType: questionPayload.questionType,
      question: questionPayload.question,
      options: questionPayload.options,
      expectedAnswer: questionPayload.expectedAnswer,
      explanation: questionPayload.explanation,
      difficulty: questionPayload.difficulty
    });

    await studyCacheService.invalidate(userId, `session:${sessionId}`);

    const { expectedAnswer: _exp, ...sanitized } = newQuestion;
    return sanitized;
  }

  public async setSessionMode(userId: string, sessionId: string, mode: StudyMode) {
    const session = await studyRepository.getSessionById(sessionId, userId);
    if (!session) throw new NotFoundError('Study session not found.');

    await studyRepository.updateSessionMode(sessionId, mode);
    await studyCacheService.invalidate(userId, `session:${sessionId}`);
    return { sessionId, mode };
  }

  public async getWeakAreas(userId: string) {
    const progresses = await prisma.studyProgress.findMany({
      where: {
        session: { userId },
        masteryScore: { lt: 60 }
      },
      include: {
        topic: true,
        session: true
      },
      orderBy: { masteryScore: 'asc' },
      take: 5
    });

    return progresses.map((p) => ({
      sessionId: p.sessionId,
      sessionTitle: p.session.title,
      topicId: p.topicId,
      topicTitle: p.topic.title,
      masteryScore: p.masteryScore,
      nextReviewAt: p.nextReviewAt
    }));
  }

  public async getRecommendations(userId: string) {
    const weakAreas = await this.getWeakAreas(userId);
    if (weakAreas.length > 0 && weakAreas[0]) {
      const topWeak = weakAreas[0];
      return {
        recommendedSessionId: topWeak.sessionId,
        recommendedTopic: topWeak.topicTitle,
        reason: `Your mastery in "${topWeak.topicTitle}" is at ${topWeak.masteryScore}%. Reviewing this topic will boost your knowledge.`
      };
    }

    const latestSession = await prisma.studySession.findFirst({
      where: { userId, status: StudySessionStatus.ACTIVE },
      orderBy: { updatedAt: 'desc' }
    });

    if (latestSession) {
      return {
        recommendedSessionId: latestSession.id,
        recommendedTopic: latestSession.title,
        reason: `Continue your study session: "${latestSession.title}".`
      };
    }

    return {
      recommendedSessionId: null,
      recommendedTopic: 'Start New Study Session',
      reason: 'Create a study session with your uploaded documents or Knowledge Base.'
    };
  }
}

export const studySessionService = new StudySessionService();
