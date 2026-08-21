import { prisma } from '@/lib/prisma';
import { ChillFocusMode, ChillFocusStatus } from '@prisma/client';

export class ChillFocusRepository {
  public async createSession(data: {
    userId: string;
    mode: ChillFocusMode;
    plannedDurationSeconds: number;
    soundscape: string;
  }) {
    return prisma.chillFocusSession.create({
      data: {
        userId: data.userId,
        mode: data.mode,
        plannedDurationSeconds: data.plannedDurationSeconds,
        soundscape: data.soundscape,
        status: ChillFocusStatus.ACTIVE,
        startedAt: new Date(),
        activeDurationSeconds: 0
      }
    });
  }

  public async findActiveSession(userId: string) {
    return prisma.chillFocusSession.findFirst({
      where: {
        userId,
        status: { in: [ChillFocusStatus.ACTIVE, ChillFocusStatus.PAUSED] }
      },
      orderBy: { startedAt: 'desc' }
    });
  }

  public async findSessionById(id: string) {
    return prisma.chillFocusSession.findUnique({
      where: { id }
    });
  }

  public async updateSession(
    id: string,
    data: {
      status?: ChillFocusStatus;
      pausedAt?: Date | null;
      resumedAt?: Date | null;
      completedAt?: Date | null;
      activeDurationSeconds?: number;
      soundscape?: string;
    }
  ) {
    return prisma.chillFocusSession.update({
      where: { id },
      data
    });
  }

  public async getPreferences(userId: string) {
    let pref = await prisma.chillFocusPreference.findUnique({
      where: { userId }
    });

    if (!pref) {
      pref = await prisma.chillFocusPreference.create({
        data: {
          userId,
          preferredMode: 'CHILL',
          preferredSoundscape: 'night_sky',
          preferredVolume: 0.7,
          breathingEnabled: true,
          interventionEnabled: true,
          reducedMotion: false
        }
      });
    }

    return pref;
  }

  public async updatePreferences(
    userId: string,
    data: {
      preferredMode?: string;
      preferredSoundscape?: string;
      preferredVolume?: number;
      breathingEnabled?: boolean;
      interventionEnabled?: boolean;
      reducedMotion?: boolean;
    }
  ) {
    return prisma.chillFocusPreference.upsert({
      where: { userId },
      create: {
        userId,
        preferredMode: data.preferredMode || 'CHILL',
        preferredSoundscape: data.preferredSoundscape || 'night_sky',
        preferredVolume: data.preferredVolume ?? 0.7,
        breathingEnabled: data.breathingEnabled ?? true,
        interventionEnabled: data.interventionEnabled ?? true,
        reducedMotion: data.reducedMotion ?? false
      },
      update: data
    });
  }

  public async getStreak(userId: string) {
    let streak = await prisma.chillFocusStreak.findUnique({
      where: { userId }
    });

    if (!streak) {
      streak = await prisma.chillFocusStreak.create({
        data: {
          userId,
          currentStreakDays: 0,
          longestStreakDays: 0,
          totalSessionsCompleted: 0
        }
      });
    }

    return streak;
  }

  public async updateStreak(
    userId: string,
    data: {
      currentStreakDays?: number;
      longestStreakDays?: number;
      lastActiveDate?: Date;
      totalSessionsCompleted?: number;
    }
  ) {
    return prisma.chillFocusStreak.upsert({
      where: { userId },
      create: {
        userId,
        currentStreakDays: data.currentStreakDays || 1,
        longestStreakDays: data.longestStreakDays || 1,
        lastActiveDate: data.lastActiveDate || new Date(),
        totalSessionsCompleted: data.totalSessionsCompleted || 1
      },
      update: data
    });
  }
}

export const chillFocusRepository = new ChillFocusRepository();
