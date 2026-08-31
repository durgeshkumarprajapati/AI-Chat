import { InsightStatus, InsightReviewAction } from '@prisma/client';
import { insightRepository, InsightWithEvidenceAndReviews } from './insight.repository';
import { auditService } from '@/features/audit/audit.service';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { AuthorizationError, NotFoundError } from '@/errors';

export interface ReviewOutcome {
  insight: InsightWithEvidenceAndReviews;
  previousStatus: InsightStatus;
}

/**
 * The human-in-the-loop review workflow for `IntelligenceInsight` rows. Every reviewed action:
 *  1. Appends a new, immutable `InsightReview` row (never updates/deletes an existing one).
 *  2. Moves `IntelligenceInsight.status` per the action.
 *  3. ALSO writes an `AuditLog` entry via `auditService` — in addition to, not instead of, (1).
 */
export class InsightReviewService {
  public async reviewInsight(
    reviewerId: string,
    insightId: string,
    action: InsightReviewAction,
    note?: string
  ): Promise<ReviewOutcome> {
    const insight = await insightRepository.getInsightByIdUnscoped(insightId);
    if (!insight) {
      throw new NotFoundError('Insight');
    }

    await this.assertReviewerAuthorized(reviewerId, insight);

    const previousStatus = insight.status;
    const nextStatus = this.computeNextStatus(previousStatus, action);

    // Append-only review trail first — this must succeed even if, for some reason, the status
    // update below is a no-op (e.g. NOTE on an already-terminal insight).
    await insightRepository.addReview(insightId, reviewerId, action, note ?? null);

    if (nextStatus !== previousStatus) {
      await insightRepository.updateStatus(insightId, nextStatus);
    }

    await auditService.logEvent({
      actorId: reviewerId,
      action: 'INSIGHT_REVIEWED',
      targetType: 'INTELLIGENCE_INSIGHT',
      targetId: insightId,
      projectId: insight.projectId ?? null,
      details: {
        reviewAction: action,
        previousStatus,
        newStatus: nextStatus,
        note: note ?? null
      }
    });

    const refreshed = await insightRepository.getInsightByIdUnscoped(insightId);
    return { insight: refreshed ?? { ...insight, status: nextStatus }, previousStatus };
  }

  private async assertReviewerAuthorized(reviewerId: string, insight: InsightWithEvidenceAndReviews): Promise<void> {
    if (insight.userId === reviewerId) return;

    if (insight.projectId) {
      // Throws AuthorizationError/NotFoundError-equivalent on failure — fails closed.
      await projectAuthorizationService.authorizeProjectAccess(reviewerId, insight.projectId, 'VIEW_PROJECT');
      return;
    }

    throw new AuthorizationError('You are not authorized to review this insight.');
  }

  private computeNextStatus(currentStatus: InsightStatus, action: InsightReviewAction): InsightStatus {
    switch (action) {
      case 'CONFIRM':
        return 'CONFIRMED';
      case 'DISMISS':
        return 'DISMISSED';
      case 'RESOLVE':
        return 'RESOLVED';
      case 'NOTE':
        return currentStatus === 'NEW' ? 'UNDER_REVIEW' : currentStatus;
      default:
        return currentStatus;
    }
  }
}

export const insightReviewService = new InsightReviewService();
