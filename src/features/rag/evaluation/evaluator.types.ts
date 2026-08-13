import { FeedbackRating, FeedbackReason } from '@prisma/client';
import { Citation } from '../chat/chat.types';
import { RetrievedChunk } from '../retrieval/retrieval.types';

export interface EvaluationScores {
  overallScore: number;
  groundednessScore: number;
  relevanceScore: number;
  citationCoverageScore: number;
  retrievalConfidenceScore: number;
  isFallback: boolean;
  evaluatorType: 'heuristic' | 'llm';
}

export interface EvaluationInput {
  userId: string;
  conversationId: string;
  messageId: string;
  knowledgeBaseId?: string | null;
  question: string;
  retrievalQuery?: string | null;
  answer: string;
  citations: Citation[];
  retrievedChunks: RetrievedChunk[];
  latencyMs?: number;
  retrievalLatencyMs?: number;
  llmLatencyMs?: number;
}

export interface UserFeedbackInput {
  userId: string;
  conversationId: string;
  messageId: string;
  rating: FeedbackRating;
  reason?: FeedbackReason;
  comment?: string;
}

export interface AggregatedRagMetrics {
  timeRange: '24h' | '7d' | '30d' | '90d' | 'all';
  knowledgeBaseId?: string | null;
  totalQuestions: number;
  totalAnswers: number;
  positiveFeedback: number;
  negativeFeedback: number;
  positiveFeedbackRate: number; // 0.0 to 1.0 (or 0-100%)
  fallbackCount: number;
  fallbackRate: number;
  avgResponseLatencyMs: number;
  avgRetrievalLatencyMs: number;
  avgRetrievedChunks: number;
  avgCitedChunks: number;
  avgCitationCoverage: number;
  avgRetrievalConfidence: number;
  avgGroundednessScore: number;
  avgOverallScore: number;
  evaluationCount: number;
}

export interface PaginatedEvaluations {
  items: Array<{
    id: string;
    conversationId: string;
    messageId: string;
    knowledgeBaseId: string | null;
    question: string;
    retrievalQuery: string | null;
    answer: string;
    overallScore: number | null;
    groundednessScore: number | null;
    relevanceScore: number | null;
    citationCoverageScore: number | null;
    retrievalConfidenceScore: number | null;
    latencyMs: number | null;
    retrievedChunkCount: number;
    citedChunkCount: number;
    isFallback: boolean;
    evaluatorType: string;
    feedback: {
      rating: FeedbackRating;
      reason: FeedbackReason | null;
      comment: string | null;
    } | null;
    createdAt: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
