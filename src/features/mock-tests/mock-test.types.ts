export type MockTestStatusType = 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
export type ParticipantStatusType = 'INVITED' | 'REGISTERED' | 'STARTED' | 'SUBMITTED' | 'AUTO_SUBMITTED' | 'EXPIRED';
export type QuestionType = 'MCQ_SINGLE' | 'MCQ_MULTI';

export interface MCQOption {
  id: string;
  optionText: string;
  isCorrect?: boolean; // Excluded from client payload before answer submission
}

export interface MCQQuestion {
  id: string;
  questionText: string;
  type: QuestionType;
  options: MCQOption[];
  correctOptionId?: string;
  explanation: string;
  groundingSource?: string;
}

export interface MockTestConfig {
  title: string;
  description?: string;
  topic?: string;
  sourceType?: 'DOCUMENT' | 'KNOWLEDGE_BASE' | 'KNOWLEDGE_GRAPH' | 'TOPIC';
  sourceDocumentIds?: string[];
  knowledgeBaseId?: string[];
  questionCount?: number;
  difficulty?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
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
}

export interface AnswerSubmissionItem {
  questionId: string;
  selectedOptionIds: string[];
  timeSpentMs?: number;
}
