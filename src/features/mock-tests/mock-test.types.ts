import { z } from 'zod';

export type MockTestStatusType = 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
export type ParticipantStatusType = 'INVITED' | 'REGISTERED' | 'STARTED' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'EXPIRED';
export type QuestionType = 'MCQ_SINGLE' | 'MCQ_MULTI';

export interface MCQOption {
  id: string;
  optionText: string;
  isCorrect?: boolean;
}

export interface MCQQuestion {
  id: string;
  questionText: string;
  type: QuestionType;
  options: MCQOption[];
  correctOptionId?: string;
  explanation: string;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  evidenceIds?: string[];
  groundingSource?: string;
}

export interface MockTestQuestionDTO {
  id: string;
  question: string;
  type: QuestionType;
  options: Array<{ id: string; optionText: string }>;
  difficulty: string;
  correctOptionId?: string;
  explanation?: string;
  evidence?: string[];
  groundingSource?: string;
}

export const MockTestOptionSchema = z.object({
  id: z.string().min(1),
  optionText: z.string().min(1, { message: 'Option text cannot be empty' }),
  isCorrect: z.boolean().optional()
});

export const MockTestGeneratedQuestionSchema = z.object({
  id: z.string().optional(),
  questionText: z.string().min(5, { message: 'Question text must be at least 5 characters' }),
  type: z.enum(['MCQ_SINGLE', 'MCQ_MULTI']).default('MCQ_SINGLE'),
  options: z.array(MockTestOptionSchema).min(4, { message: 'Question must have at least 4 options' }),
  correctOptionId: z.string().min(1),
  explanation: z.string().min(5, { message: 'Explanation must be provided' }),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED']).default('MEDIUM'),
  evidenceIds: z.array(z.string()).optional().default([])
}).refine((data) => {
  const optionIds = data.options.map((o) => o.id);
  const uniqueOptionTexts = new Set(data.options.map((o) => o.optionText.trim().toLowerCase()));
  if (uniqueOptionTexts.size < data.options.length) return false;
  return optionIds.includes(data.correctOptionId);
}, {
  message: 'Options must be unique and correctOptionId must match a valid option'
});

export interface MockTestConfig {
  title: string;
  description?: string;
  topic?: string;
  sourceType?: 'DOCUMENT' | 'KNOWLEDGE_BASE' | 'KNOWLEDGE_GRAPH' | 'TOPIC';
  sourceDocumentIds?: string[];
  documentId?: string;
  knowledgeBaseId?: string;
  questionCount?: number;
  difficulty?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'EASY' | 'MEDIUM' | 'HARD';
  durationMinutes?: number;
  scheduledStartAt: string | Date;
  timezone?: string;
  allowLateJoin?: boolean;
  maxParticipants?: number;
  showScoreImmediately?: boolean;
  showCorrectAnswers?: boolean;
  randomizeQuestions?: boolean;
  randomizeOptions?: boolean;
  allowRetake?: boolean;
  visibility?: 'PRIVATE' | 'CHANNEL' | 'PUBLIC';
}

export interface ClientQuestionPayload {
  id: string;
  questionText: string;
  type: QuestionType;
  options: Array<{ id: string; optionText: string }>;
  difficulty?: string;
}

export interface AnswerSubmissionItem {
  questionId: string;
  selectedOptionIds: string[];
  timeSpentMs?: number;
}
