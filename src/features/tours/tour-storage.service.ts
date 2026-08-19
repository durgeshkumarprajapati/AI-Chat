import { prisma } from '@/lib/prisma';
import { UserTourProgressRecord, TourStatus } from './tour-types';

export class TourStorageService {
  /**
   * Retrieves tour progress record for user and tourId.
   */
  public async getProgress(userId: string, tourId: string): Promise<UserTourProgressRecord | null> {
    if (!userId || !tourId) return null;

    try {
      const record = await prisma.userTourProgress.findUnique({
        where: {
          userId_tourId: {
            userId,
            tourId
          }
        }
      });

      if (!record) return null;

      return {
        id: record.id,
        userId: record.userId,
        tourId: record.tourId,
        tourVersion: record.tourVersion,
        status: record.status as TourStatus,
        currentStep: record.currentStep,
        startedAt: record.startedAt ? record.startedAt.toISOString() : null,
        completedAt: record.completedAt ? record.completedAt.toISOString() : null,
        skippedAt: record.skippedAt ? record.skippedAt.toISOString() : null,
        lastSeenAt: record.lastSeenAt ? record.lastSeenAt.toISOString() : null
      };
    } catch (err) {
      console.warn(`[TourStorageService] Failed DB getProgress for ${tourId}:`, err);
      return null;
    }
  }

  /**
   * Saves or updates tour progress record for authenticated user.
   */
  public async saveProgress(
    userId: string,
    tourId: string,
    tourVersion: number,
    status: TourStatus,
    currentStep: number
  ): Promise<UserTourProgressRecord> {
    const now = new Date();
    const isCompleted = status === 'COMPLETED';
    const isSkipped = status === 'SKIPPED';

    try {
      const record = await prisma.userTourProgress.upsert({
        where: {
          userId_tourId: {
            userId,
            tourId
          }
        },
        create: {
          userId,
          tourId,
          tourVersion,
          status,
          currentStep,
          startedAt: now,
          completedAt: isCompleted ? now : null,
          skippedAt: isSkipped ? now : null,
          lastSeenAt: now
        },
        update: {
          tourVersion,
          status,
          currentStep,
          completedAt: isCompleted ? now : undefined,
          skippedAt: isSkipped ? now : undefined,
          lastSeenAt: now
        }
      });

      return {
        id: record.id,
        userId: record.userId,
        tourId: record.tourId,
        tourVersion: record.tourVersion,
        status: record.status as TourStatus,
        currentStep: record.currentStep,
        startedAt: record.startedAt ? record.startedAt.toISOString() : null,
        completedAt: record.completedAt ? record.completedAt.toISOString() : null,
        skippedAt: record.skippedAt ? record.skippedAt.toISOString() : null,
        lastSeenAt: record.lastSeenAt ? record.lastSeenAt.toISOString() : null
      };
    } catch (err) {
      console.warn(`[TourStorageService] Failed DB saveProgress for ${tourId}:`, err);
      return {
        userId,
        tourId,
        tourVersion,
        status,
        currentStep,
        lastSeenAt: now.toISOString()
      };
    }
  }
}

export const tourStorageService = new TourStorageService();
