export type CityExplorerAnswerStatus = 'READY' | 'LOADING' | 'FAILED' | 'NO_EVIDENCE';

export type QuestionKind = 'STATIC' | 'DYNAMIC';

export interface PredefinedQuestionItem {
  id: string;
  category: string;
  categoryIcon: string;
  question: string;
  kind: QuestionKind;
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
  citations?: CitationItem[];
  cached?: boolean;
  isStale?: boolean;
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
