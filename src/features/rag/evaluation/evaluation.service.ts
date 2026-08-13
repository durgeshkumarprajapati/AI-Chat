import { prisma } from '@/lib/prisma';
import { localHeuristicEvaluator, RAGEvaluator } from './evaluator';
import { AggregatedRagMetrics, EvaluationInput, PaginatedEvaluations, UserFeedbackInput } from './evaluator.types';
import { NotFoundError, AuthorizationError } from '@/errors';
import { FeedbackRating, FeedbackReason, Prisma } from '@prisma/client';
import { env } from '@/config/env';

export class EvaluationService {
  private evaluator: RAGEvaluator;

  constructor(evaluator?: RAGEvaluator) {
    this.evaluator = evaluator || localHeuristicEvaluator;
  }

  /**
   * Evaluates an assistant message and persists evaluation record in PostgreSQL.
   */
  public async evaluateAndPersist(input: EvaluationInput): Promise<void> {
    const enabled = env.server?.RAG_EVALUATION_ENABLED ?? true;
    if (!enabled) return;

    try {
      // Confirm message exists
      const msg = await prisma.message.findFirst({
        where: { id: input.messageId },
        include: { conversation: true }
      });

      if (!msg || msg.conversation.userId !== input.userId) {
        console.warn(`[EvaluationService] Skipped evaluation: message ${input.messageId} not found or unauthorized.`);
        return;
      }

      const evaluationStart = Date.now();
      const scores = await this.evaluator.evaluateAnswer(input);
      // Evaluation latency is evaluator execution time; persistence is deliberately
      // excluded from user-facing response latency and happens after stream completion.
      const evaluationLatencyMs = Date.now() - evaluationStart;

      try {
        await prisma.ragEvaluation.upsert({
          where: { messageId: input.messageId },
          update: {
            overallScore: scores.overallScore,
            groundednessScore: scores.groundednessScore,
            relevanceScore: scores.relevanceScore,
            citationCoverageScore: scores.citationCoverageScore,
            retrievalConfidenceScore: scores.retrievalConfidenceScore,
            latencyMs: input.latencyMs || null,
            responseLatencyMs: input.responseLatencyMs ?? input.latencyMs ?? null,
            retrievalLatencyMs: input.retrievalLatencyMs || null,
            llmLatencyMs: input.llmLatencyMs || null,
            llmFirstTokenMs: input.llmFirstTokenMs || null,
            evaluationLatencyMs,
            latencyTrace: input.latencyTrace as Prisma.InputJsonValue | undefined,
            retrievedChunkCount: input.retrievedChunks.length,
            citedChunkCount: input.citations.length,
            isFallback: scores.isFallback,
            evaluatorType: scores.evaluatorType
          },
          create: {
            userId: input.userId,
            conversationId: input.conversationId,
            messageId: input.messageId,
            knowledgeBaseId: input.knowledgeBaseId || msg.conversation.knowledgeBaseId || null,
            question: input.question,
            retrievalQuery: input.retrievalQuery || input.question,
            answer: input.answer,
            overallScore: scores.overallScore,
            groundednessScore: scores.groundednessScore,
            relevanceScore: scores.relevanceScore,
            citationCoverageScore: scores.citationCoverageScore,
            retrievalConfidenceScore: scores.retrievalConfidenceScore,
            latencyMs: input.latencyMs || null,
            responseLatencyMs: input.responseLatencyMs ?? input.latencyMs ?? null,
            retrievalLatencyMs: input.retrievalLatencyMs || null,
            llmLatencyMs: input.llmLatencyMs || null,
            llmFirstTokenMs: input.llmFirstTokenMs || null,
            evaluationLatencyMs,
            latencyTrace: input.latencyTrace as Prisma.InputJsonValue | undefined,
            retrievedChunkCount: input.retrievedChunks.length,
            citedChunkCount: input.citations.length,
            isFallback: scores.isFallback,
            evaluatorType: scores.evaluatorType
          }
        });
        console.log(`[EvaluationService] Evaluation persisted for message ${input.messageId}: groundedness=${scores.groundednessScore}, overall=${scores.overallScore}`);
      } catch (err) {
        console.warn(`[EvaluationService] Evaluation persistence skipped (conversation deleted):`, err instanceof Error ? err.message : err);
      }
    } catch (err) {
      console.error('[EvaluationService] Evaluation failed safely:', err);
    }
  }

  /**
   * Submits or updates user feedback (👍/👎) for an assistant message.
   */
  public async submitFeedback(input: UserFeedbackInput): Promise<void> {
    const msg = await prisma.message.findFirst({
      where: { id: input.messageId },
      include: { conversation: true }
    });

    if (!msg) {
      throw new NotFoundError('Message');
    }
    if (msg.conversation.userId !== input.userId) {
      throw new AuthorizationError('Access denied to specified message feedback');
    }

    await prisma.userFeedback.upsert({
      where: { messageId: input.messageId },
      update: {
        rating: input.rating,
        reason: input.reason || null,
        comment: input.comment || null
      },
      create: {
        userId: input.userId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        rating: input.rating,
        reason: input.reason || null,
        comment: input.comment || null
      }
    });
  }

  /**
   * Lists user feedback items for authenticated user.
   */
  public async getUserFeedbackList(userId: string): Promise<Array<{
    id: string;
    conversationId: string;
    messageId: string;
    rating: FeedbackRating;
    reason: FeedbackReason | null;
    comment: string | null;
    createdAt: string;
  }>> {
    const list = await prisma.userFeedback.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    return list.map((f) => ({
      id: f.id,
      conversationId: f.conversationId,
      messageId: f.messageId,
      rating: f.rating,
      reason: f.reason,
      comment: f.comment,
      createdAt: f.createdAt.toISOString()
    }));
  }

  /**
   * Calculates aggregated metrics over a date range for a user / Knowledge Base.
   */
  public async getAggregatedMetrics(
    userId: string,
    options?: {
      timeRange?: '24h' | '7d' | '30d' | '90d' | 'all';
      knowledgeBaseId?: string | null;
    }
  ): Promise<AggregatedRagMetrics> {
    const range = options?.timeRange || '30d';
    let dateFilter: Date | undefined;

    const now = new Date();
    if (range === '24h') dateFilter = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    else if (range === '7d') dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (range === '30d') dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    else if (range === '90d') dateFilter = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const evalWhere: Prisma.RagEvaluationWhereInput = {
      userId,
      ...(dateFilter ? { createdAt: { gte: dateFilter } } : {}),
      ...(options?.knowledgeBaseId ? { knowledgeBaseId: options.knowledgeBaseId } : {})
    };

    const feedbackWhere: Prisma.UserFeedbackWhereInput = {
      userId,
      ...(dateFilter ? { createdAt: { gte: dateFilter } } : {})
    };

    const [evalStats, posFeedback, negFeedback, totalFeedbacks] = await Promise.all([
      prisma.ragEvaluation.aggregate({
        where: evalWhere,
        _count: { id: true },
        _avg: {
          overallScore: true,
          groundednessScore: true,
          citationCoverageScore: true,
          retrievalConfidenceScore: true,
          latencyMs: true,
          responseLatencyMs: true,
          retrievalLatencyMs: true,
          llmLatencyMs: true,
          llmFirstTokenMs: true,
          evaluationLatencyMs: true,
          retrievedChunkCount: true,
          citedChunkCount: true
        }
      }),
      prisma.userFeedback.count({ where: { ...feedbackWhere, rating: 'POSITIVE' } }),
      prisma.userFeedback.count({ where: { ...feedbackWhere, rating: 'NEGATIVE' } }),
      prisma.userFeedback.count({ where: feedbackWhere })
    ]);

    const fallbackCount = await prisma.ragEvaluation.count({
      where: { ...evalWhere, isFallback: true }
    });

    const totalQuestions = evalStats._count.id || 0;
    const posRate = totalFeedbacks > 0 ? posFeedback / totalFeedbacks : 1.0;
    const fallbackRate = totalQuestions > 0 ? fallbackCount / totalQuestions : 0.0;

    return {
      timeRange: range,
      knowledgeBaseId: options?.knowledgeBaseId || null,
      totalQuestions,
      totalAnswers: totalQuestions,
      positiveFeedback: posFeedback,
      negativeFeedback: negFeedback,
      positiveFeedbackRate: Number(posRate.toFixed(4)),
      fallbackCount,
      fallbackRate: Number(fallbackRate.toFixed(4)),
      avgResponseLatencyMs: Math.round(evalStats._avg.responseLatencyMs || evalStats._avg.latencyMs || 0),
      avgRetrievalLatencyMs: Math.round(evalStats._avg.retrievalLatencyMs || 0),
      avgLlmLatencyMs: Math.round(evalStats._avg.llmLatencyMs || 0),
      avgLlmFirstTokenMs: Math.round(evalStats._avg.llmFirstTokenMs || 0),
      avgEvaluationLatencyMs: Math.round(evalStats._avg.evaluationLatencyMs || 0),
      avgRetrievedChunks: Number((evalStats._avg.retrievedChunkCount || 0).toFixed(1)),
      avgCitedChunks: Number((evalStats._avg.citedChunkCount || 0).toFixed(1)),
      avgCitationCoverage: Number((evalStats._avg.citationCoverageScore || 0).toFixed(4)),
      avgRetrievalConfidence: Number((evalStats._avg.retrievalConfidenceScore || 0).toFixed(4)),
      avgGroundednessScore: Number((evalStats._avg.groundednessScore || 0).toFixed(4)),
      avgOverallScore: Number((evalStats._avg.overallScore || 0).toFixed(4)),
      evaluationCount: totalQuestions
    };
  }

  /**
   * Paginated list of RAG evaluation records.
   */
  public async listEvaluationsPaginated(
    userId: string,
    options?: {
      page?: number;
      pageSize?: number;
      knowledgeBaseId?: string | null;
      rating?: FeedbackRating;
      search?: string;
    }
  ): Promise<PaginatedEvaluations> {
    const page = Math.max(1, options?.page || 1);
    const pageSize = Math.min(100, Math.max(1, options?.pageSize || 20));
    const skip = (page - 1) * pageSize;

    const where: Prisma.RagEvaluationWhereInput = {
      userId,
      ...(options?.knowledgeBaseId ? { knowledgeBaseId: options.knowledgeBaseId } : {}),
      ...(options?.search
        ? {
            OR: [
              { question: { contains: options.search, mode: 'insensitive' } },
              { answer: { contains: options.search, mode: 'insensitive' } }
            ]
          }
        : {})
    };

    const [items, total] = await Promise.all([
      prisma.ragEvaluation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: pageSize,
        skip,
        include: {
          message: {
            include: {
              userFeedback: true
            }
          }
        }
      }),
      prisma.ragEvaluation.count({ where })
    ]);

    const totalPages = Math.ceil(total / pageSize) || 1;

    return {
      items: items.map((e) => ({
        id: e.id,
        conversationId: e.conversationId,
        messageId: e.messageId,
        knowledgeBaseId: e.knowledgeBaseId,
        question: e.question,
        retrievalQuery: e.retrievalQuery,
        answer: e.answer,
        overallScore: e.overallScore,
        groundednessScore: e.groundednessScore,
        relevanceScore: e.relevanceScore,
        citationCoverageScore: e.citationCoverageScore,
        retrievalConfidenceScore: e.retrievalConfidenceScore,
        latencyMs: e.latencyMs,
        responseLatencyMs: e.responseLatencyMs ?? e.latencyMs,
        retrievalLatencyMs: e.retrievalLatencyMs,
        llmLatencyMs: e.llmLatencyMs,
        llmFirstTokenMs: e.llmFirstTokenMs,
        evaluationLatencyMs: e.evaluationLatencyMs,
        latencyTrace: e.latencyTrace as Record<string, number> | null,
        retrievedChunkCount: e.retrievedChunkCount,
        citedChunkCount: e.citedChunkCount,
        isFallback: e.isFallback,
        evaluatorType: e.evaluatorType,
        feedback: e.message.userFeedback
          ? {
              rating: e.message.userFeedback.rating,
              reason: e.message.userFeedback.reason,
              comment: e.message.userFeedback.comment
            }
          : null,
        createdAt: e.createdAt.toISOString()
      })),
      total,
      page,
      pageSize,
      totalPages
    };
  }

  /**
   * Retrieves single evaluation details.
   */
  public async getEvaluationDetail(userId: string, evaluationId: string) {
    const record = await prisma.ragEvaluation.findFirst({
      where: { id: evaluationId, userId },
      include: {
        message: {
          include: {
            userFeedback: true
          }
        }
      }
    });

    if (!record) {
      throw new NotFoundError('RAG Evaluation');
    }

    return record;
  }
}

export const evaluationService = new EvaluationService();
