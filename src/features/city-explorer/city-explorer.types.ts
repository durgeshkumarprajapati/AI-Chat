import { z } from 'zod';

export const ExploreAnswerSchema = z.object({
  answer: z.string().min(1),
  confidence: z.enum(['high', 'medium', 'low']).catch('medium'),
  highlights: z.array(z.string()).optional()
});

export type ExploreAnswerDTO = z.infer<typeof ExploreAnswerSchema>;

export type CityExplorerAnswerStatus = 'READY' | 'LOADING' | 'FAILED' | 'NO_EVIDENCE' | 'UNAVAILABLE';

export type QuestionKind = 'STATIC' | 'DYNAMIC';

export type QuestionPriority = 'P0' | 'P1' | 'P2';

export interface PredefinedQuestionItem {
  id: string;
  category: string;
  categoryIcon: string;
  question: string;
  kind: QuestionKind;
  priority: QuestionPriority;
  description?: string;
  isWeather?: boolean;
}

export interface CityInfo {
  name: string;
  region?: string;
  country?: string;
}

export interface CitationItem {
  title: string;
  url?: string;
  domain?: string;
  snippet?: string;
}

export interface CityExplorerAnswerResult {
  questionId: string;
  category: string;
  question: string;
  status: CityExplorerAnswerStatus;
  answer?: string;
  confidence?: 'high' | 'medium' | 'low';
  highlights?: string[];
  citations?: CitationItem[];
  provider?: string;
  cached?: boolean;
  isStale?: boolean;
  durationMs?: number;
  generatedAt?: string;
  error?: string;
}

export interface PrefetchRequestInput {
  city: string;
  region?: string;
  country?: string;
  questionIds?: string[];
  forceRefreshQuestionId?: string;
}

export interface PrefetchResponsePayload {
  success: boolean;
  city: CityInfo;
  answers: CityExplorerAnswerResult[];
}

export interface CityStreamEvent {
  type: 'answer' | 'error' | 'done';
  city: string;
  questionId?: string;
  answer?: CityExplorerAnswerResult;
  error?: string;
  completedCount?: number;
  totalCount?: number;
}
