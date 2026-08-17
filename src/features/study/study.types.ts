import {
  StudyGoal,
  StudyDifficulty,
  StudyLearningStyle,
  StudyMode,
  StudySessionStatus,
  StudyQuestionType
} from '@prisma/client';

export {
  StudyGoal,
  StudyDifficulty,
  StudyLearningStyle,
  StudyMode,
  StudySessionStatus,
  StudyQuestionType
};

export interface CreateStudySessionInput {
  title?: string;
  knowledgeBaseId?: string;
  roadmapId?: string;
  documentIds?: string[];
  goal?: StudyGoal;
  difficulty?: StudyDifficulty;
  learningStyle?: StudyLearningStyle;
  durationMinutes?: number;
  externalWebEnabled?: boolean;
}

export interface GeneratedStudyTopic {
  title: string;
  description: string;
  order: number;
}

export interface GeneratedQuestionPayload {
  questionType: StudyQuestionType;
  question: string;
  options?: string[];
  expectedAnswer: string;
  explanation: string;
  difficulty: StudyDifficulty;
  citations?: Array<{ title: string; pageNumber?: number; url?: string }>;
}

export interface AnswerEvaluationResult {
  score: number; // 0 to 10
  isCorrect: boolean;
  feedback: string;
  missingConcepts?: string[];
  strengths?: string[];
  citations?: Array<{ title: string; pageNumber?: number; url?: string }>;
}

export interface StudyProgressSummary {
  progressPercent: number;
  totalTopics: number;
  completedTopics: number;
  attemptedQuestions: number;
  correctAnswers: number;
  averageMasteryScore: number;
  weakAreas: Array<{ topicId: string; title: string; masteryScore: number }>;
  recommendedReview?: { topicId: string; title: string; reason: string };
}
