import { prisma } from '@/lib/prisma';
import { SharePermission } from '@prisma/client';
import { AuthorizationError, NotFoundError, ValidationError } from '@/errors';

export class RoadmapSharingService {
  /**
   * Shares a roadmap with another registered user.
   */
  async shareRoadmap(
    roadmapId: string,
    ownerId: string,
    targetEmail: string,
    permission: SharePermission = SharePermission.VIEW,
    expiresInDays?: number
  ) {
    // 1. Verify ownership of the roadmap
    const roadmap = await prisma.roadmap.findUnique({ where: { id: roadmapId } });
    if (!roadmap || roadmap.userId !== ownerId) {
      throw new AuthorizationError('Only the roadmap owner can grant or modify shares.');
    }

    const recipientEmail = targetEmail.trim().toLowerCase();
    const recipient = await prisma.user.findUnique({ where: { email: recipientEmail } });

    if (!recipient) {
      throw new NotFoundError('User with specified email address');
    }

    if (recipient.id === ownerId) {
      throw new ValidationError('You cannot share a roadmap with yourself.');
    }

    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86400 * 1000) : null;

    // Check existing active share
    const existingShare = await prisma.roadmapShare.findFirst({
      where: { roadmapId, sharedWithUserId: recipient.id, revokedAt: null }
    });

    if (existingShare) {
      return prisma.roadmapShare.update({
        where: { id: existingShare.id },
        data: { permission, expiresAt }
      });
    }

    return prisma.roadmapShare.create({
      data: {
        roadmapId,
        ownerId,
        sharedWithUserId: recipient.id,
        permission,
        expiresAt
      },
      include: {
        sharedWithUser: { select: { id: true, email: true, name: true } }
      }
    });
  }

  /**
   * Revokes a share.
   */
  async revokeShare(shareId: string, ownerId: string) {
    const share = await prisma.roadmapShare.findUnique({
      where: { id: shareId },
      include: { roadmap: true }
    });

    if (!share || share.ownerId !== ownerId) {
      throw new AuthorizationError('Only the owner can revoke roadmap shares.');
    }

    return prisma.roadmapShare.update({
      where: { id: shareId },
      data: { revokedAt: new Date() }
    });
  }

  /**
   * Lists all active shares for a roadmap.
   */
  async getRoadmapShares(roadmapId: string, ownerId: string) {
    const roadmap = await prisma.roadmap.findUnique({ where: { id: roadmapId } });
    if (!roadmap || roadmap.userId !== ownerId) {
      throw new AuthorizationError('Only the owner can view share permissions.');
    }

    return prisma.roadmapShare.findMany({
      where: { roadmapId, revokedAt: null },
      include: {
        sharedWithUser: { select: { id: true, email: true, name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }
}

export const roadmapSharingService = new RoadmapSharingService();
