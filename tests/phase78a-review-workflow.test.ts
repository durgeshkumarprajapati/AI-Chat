jest.mock('@/lib/prisma', () => ({
  prisma: {
    intelligenceInsight: { findFirst: jest.fn(), update: jest.fn() },
    insightReview: { create: jest.fn() }
  }
}));
jest.mock('@/features/audit/audit.service', () => ({
  auditService: { logEvent: jest.fn() }
}));
jest.mock('@/features/projects/project-authorization.service', () => ({
  projectAuthorizationService: { authorizeProjectAccess: jest.fn() }
}));

import { prisma } from '@/lib/prisma';
import { auditService } from '@/features/audit/audit.service';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { insightReviewService } from '@/features/knowledge-intelligence/insight-review.service';
import { AuthorizationError } from '@/errors';

function makeInsight(overrides: Record<string, any> = {}) {
  return {
    id: 'insight-1',
    userId: 'owner-1',
    projectId: null,
    status: 'NEW',
    type: 'CONTRADICTION',
    metadata: {},
    evidence: [],
    reviews: [],
    ...overrides
  };
}

describe('Phase 78A — insight review workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.insightReview.create as jest.Mock).mockResolvedValue({ id: 'review-1' });
    (prisma.intelligenceInsight.update as jest.Mock).mockImplementation(async ({ where, data }: any) => ({
      id: where.id,
      ...data
    }));
  });

  it('CONFIRM moves a NEW insight to CONFIRMED, appends a review row, and audit-logs INSIGHT_REVIEWED', async () => {
    const insight = makeInsight();
    (prisma.intelligenceInsight.findFirst as jest.Mock).mockResolvedValue(insight);

    const outcome = await insightReviewService.reviewInsight('owner-1', 'insight-1', 'CONFIRM', 'looks right');

    expect(prisma.insightReview.create).toHaveBeenCalledWith({
      data: { insightId: 'insight-1', reviewerId: 'owner-1', action: 'CONFIRM', note: 'looks right' }
    });
    expect(prisma.intelligenceInsight.update).toHaveBeenCalledWith({
      where: { id: 'insight-1' },
      data: { status: 'CONFIRMED' }
    });
    expect(auditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'owner-1',
        action: 'INSIGHT_REVIEWED',
        targetType: 'INTELLIGENCE_INSIGHT',
        targetId: 'insight-1',
        details: expect.objectContaining({ reviewAction: 'CONFIRM', previousStatus: 'NEW', newStatus: 'CONFIRMED' })
      })
    );
    expect(outcome.previousStatus).toBe('NEW');
  });

  it('DISMISS moves status to DISMISSED', async () => {
    (prisma.intelligenceInsight.findFirst as jest.Mock).mockResolvedValue(makeInsight());
    await insightReviewService.reviewInsight('owner-1', 'insight-1', 'DISMISS');
    expect(prisma.intelligenceInsight.update).toHaveBeenCalledWith({ where: { id: 'insight-1' }, data: { status: 'DISMISSED' } });
  });

  it('RESOLVE moves status to RESOLVED', async () => {
    (prisma.intelligenceInsight.findFirst as jest.Mock).mockResolvedValue(makeInsight({ status: 'CONFIRMED' }));
    await insightReviewService.reviewInsight('owner-1', 'insight-1', 'RESOLVE');
    expect(prisma.intelligenceInsight.update).toHaveBeenCalledWith({ where: { id: 'insight-1' }, data: { status: 'RESOLVED' } });
  });

  it('NOTE on a NEW insight moves it to UNDER_REVIEW (first-review transition)', async () => {
    (prisma.intelligenceInsight.findFirst as jest.Mock).mockResolvedValue(makeInsight({ status: 'NEW' }));
    await insightReviewService.reviewInsight('owner-1', 'insight-1', 'NOTE', 'just a note');
    expect(prisma.intelligenceInsight.update).toHaveBeenCalledWith({ where: { id: 'insight-1' }, data: { status: 'UNDER_REVIEW' } });
  });

  it('NOTE on an already-reviewed insight leaves status unchanged and skips the status update call', async () => {
    (prisma.intelligenceInsight.findFirst as jest.Mock).mockResolvedValue(makeInsight({ status: 'UNDER_REVIEW' }));
    await insightReviewService.reviewInsight('owner-1', 'insight-1', 'NOTE', 'another note');
    expect(prisma.intelligenceInsight.update).not.toHaveBeenCalled();
    // The append-only review row is still recorded even when status doesn't change.
    expect(prisma.insightReview.create).toHaveBeenCalledTimes(1);
  });

  it('never updates or deletes an existing InsightReview row — only ever appends via create', async () => {
    (prisma.intelligenceInsight.findFirst as jest.Mock).mockResolvedValue(makeInsight());
    await insightReviewService.reviewInsight('owner-1', 'insight-1', 'CONFIRM');
    await insightReviewService.reviewInsight('owner-1', 'insight-1', 'NOTE', 'second pass');
    expect(prisma.insightReview.create).toHaveBeenCalledTimes(2);
    expect((prisma as any).insightReview.update).toBeUndefined();
    expect((prisma as any).insightReview.delete).toBeUndefined();
  });

  it('a project member with VIEW_PROJECT access may review a project-scoped insight they do not own', async () => {
    (prisma.intelligenceInsight.findFirst as jest.Mock).mockResolvedValue(
      makeInsight({ userId: 'other-owner', projectId: 'proj-1' })
    );
    (projectAuthorizationService.authorizeProjectAccess as jest.Mock).mockResolvedValue('EDITOR');

    await insightReviewService.reviewInsight('member-1', 'insight-1', 'CONFIRM');

    expect(projectAuthorizationService.authorizeProjectAccess).toHaveBeenCalledWith('member-1', 'proj-1', 'VIEW_PROJECT');
    expect(prisma.insightReview.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reviewerId: 'member-1' }) })
    );
  });

  it('rejects a non-owner reviewing a non-project insight', async () => {
    (prisma.intelligenceInsight.findFirst as jest.Mock).mockResolvedValue(makeInsight({ userId: 'other-owner', projectId: null }));

    await expect(insightReviewService.reviewInsight('stranger', 'insight-1', 'CONFIRM')).rejects.toThrow(AuthorizationError);
    expect(prisma.insightReview.create).not.toHaveBeenCalled();
  });

  it('propagates a project-authorization failure without recording a review', async () => {
    (prisma.intelligenceInsight.findFirst as jest.Mock).mockResolvedValue(
      makeInsight({ userId: 'other-owner', projectId: 'proj-1' })
    );
    (projectAuthorizationService.authorizeProjectAccess as jest.Mock).mockRejectedValue(new AuthorizationError('nope'));

    await expect(insightReviewService.reviewInsight('stranger', 'insight-1', 'CONFIRM')).rejects.toThrow(AuthorizationError);
    expect(prisma.insightReview.create).not.toHaveBeenCalled();
  });

  it('throws NotFoundError-shaped error when the insight does not exist', async () => {
    (prisma.intelligenceInsight.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(insightReviewService.reviewInsight('owner-1', 'missing', 'CONFIRM')).rejects.toThrow(/not found/i);
  });
});
