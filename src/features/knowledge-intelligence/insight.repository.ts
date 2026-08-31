import { prisma } from '@/lib/prisma';
import {
  IntelligenceInsight,
  IntelligenceEvidence,
  InsightReview,
  InsightStatus,
  InsightReviewAction,
  Prisma
} from '@prisma/client';
import { CreateInsightInput, EvidenceInput, InsightFilters } from './knowledge-intelligence.types';

export type InsightWithEvidence = IntelligenceInsight & { evidence: IntelligenceEvidence[] };
export type InsightWithEvidenceAndReviews = IntelligenceInsight & {
  evidence: IntelligenceEvidence[];
  reviews: InsightReview[];
};

/**
 * Thin Prisma wrapper for the Phase 78A intelligence tables. Every `sourceId` accepted here is
 * expected to have already been resolved by the caller against a real row (a real Document.id,
 * KnowledgeClaim.id, Meeting.id, ...) — this repository never invents or validates IDs itself,
 * it only ever persists what it is given, so callers (the detection services) carry the burden
 * of only ever passing real, looked-up IDs.
 */
export class InsightRepository {
  public async createInsight(input: CreateInsightInput): Promise<InsightWithEvidence> {
    return prisma.intelligenceInsight.create({
      data: {
        userId: input.userId,
        projectId: input.projectId ?? null,
        type: input.type,
        severity: input.severity,
        title: input.title,
        description: input.description,
        confidenceBand: input.confidenceBand,
        confidenceScore: input.confidenceScore ?? null,
        detectionVersion: input.detectionVersion,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        evidence: {
          create: input.evidence.map((e) => ({
            sourceType: e.sourceType,
            sourceId: e.sourceId,
            snippet: e.snippet ?? null,
            sourceTimestamp: e.sourceTimestamp ?? null
          }))
        }
      },
      include: { evidence: true }
    });
  }

  public async addEvidence(insightId: string, evidence: EvidenceInput[]): Promise<IntelligenceEvidence[]> {
    if (!evidence.length) return [];
    await prisma.intelligenceEvidence.createMany({
      data: evidence.map((e) => ({
        insightId,
        sourceType: e.sourceType,
        sourceId: e.sourceId,
        snippet: e.snippet ?? null,
        sourceTimestamp: e.sourceTimestamp ?? null
      }))
    });
    return prisma.intelligenceEvidence.findMany({ where: { insightId } });
  }

  public async listInsights(userId: string, filters?: InsightFilters): Promise<IntelligenceInsight[]> {
    return prisma.intelligenceInsight.findMany({
      where: {
        userId,
        status: filters?.status ?? undefined,
        type: filters?.type ?? undefined,
        projectId: filters?.projectId ?? undefined
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /** Project-scoped listing — caller must have already authorized project access. */
  public async listInsightsForProject(
    projectId: string,
    filters?: Omit<InsightFilters, 'projectId'>
  ): Promise<IntelligenceInsight[]> {
    return prisma.intelligenceInsight.findMany({
      where: {
        projectId,
        status: filters?.status ?? undefined,
        type: filters?.type ?? undefined
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * Ownership-verified single fetch — `where: {id, userId}` so a caller can never read another
   * user's insight by guessing an id. Use this whenever the caller is only the insight's own owner.
   */
  public async getInsightById(id: string, userId: string): Promise<InsightWithEvidenceAndReviews | null> {
    return prisma.intelligenceInsight.findFirst({
      where: { id, userId },
      include: { evidence: true, reviews: true }
    });
  }

  /**
   * Unscoped-by-owner fetch, for use ONLY after the caller has independently verified the
   * requester is authorized (e.g. project membership via `projectAuthorizationService`). Never
   * expose this directly to a request without a preceding authorization check.
   */
  public async getInsightByIdUnscoped(id: string): Promise<InsightWithEvidenceAndReviews | null> {
    return prisma.intelligenceInsight.findFirst({
      where: { id },
      include: { evidence: true, reviews: true }
    });
  }

  /** Dedupe helper: finds an existing insight whose metadata carries the given key/value pair. */
  public async findByMetadataKey(userId: string, type: string, key: string, value: string): Promise<IntelligenceInsight | null> {
    return prisma.intelligenceInsight.findFirst({
      where: {
        userId,
        type: type as any,
        metadata: { path: [key], equals: value }
      }
    });
  }

  /** Append-only — never updates or deletes an existing `InsightReview` row. */
  public async addReview(
    insightId: string,
    reviewerId: string,
    action: InsightReviewAction,
    note?: string | null
  ): Promise<InsightReview> {
    return prisma.insightReview.create({
      data: { insightId, reviewerId, action, note: note ?? null }
    });
  }

  public async updateStatus(insightId: string, status: InsightStatus): Promise<IntelligenceInsight> {
    return prisma.intelligenceInsight.update({
      where: { id: insightId },
      data: { status }
    });
  }
}

export const insightRepository = new InsightRepository();
