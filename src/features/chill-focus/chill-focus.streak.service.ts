import { chillFocusRepository } from './chill-focus.repository';
import { chillFocusTelemetryService } from './chill-focus.telemetry.service';
import { CalmStreakSummaryDTO } from './chill-focus.types';
import { envConfig } from '@/config/env';

export class ChillFocusStreakService {
  /**
   * Retrieves current streak summary for user
   */
  public async getStreakSummary(userId: string): Promise<CalmStreakSummaryDTO> {
    const streak = await chillFocusRepository.getStreak(userId);
    const todayStr = new Date().toISOString().slice(0, 10);
    const lastActiveStr = streak.lastActiveDate ? new Date(streak.lastActiveDate).toISOString().slice(0, 10) : null;
    const earnedToday = lastActiveStr === todayStr;

    return {
      userId: streak.userId,
      currentStreakDays: streak.currentStreakDays,
      longestStreakDays: streak.longestStreakDays,
      lastActiveDate: streak.lastActiveDate ? new Date(streak.lastActiveDate).toISOString() : null,
      totalSessionsCompleted: streak.totalSessionsCompleted,
      earnedToday
    };
  }

  /**
   * Evaluates and updates streak upon session completion
   */
  public async recordCompletedSession(userId: string, activeDurationSeconds: number): Promise<CalmStreakSummaryDTO> {
    const streak = await chillFocusRepository.getStreak(userId);
    const minSeconds = (envConfig.chillFocus?.streakMinutes || 5) * 60;

    const newTotalSessions = streak.totalSessionsCompleted + 1;
    let newCurrent = streak.currentStreakDays;
    let newLongest = streak.longestStreakDays;
    let newLastActive = streak.lastActiveDate ? new Date(streak.lastActiveDate) : undefined;

    // Check if session qualifies for streak day credit
    if (activeDurationSeconds >= minSeconds) {
      const now = new Date();
      const todayDateStr = now.toISOString().slice(0, 10);

      if (!streak.lastActiveDate) {
        // First ever qualifying session
        newCurrent = 1;
        newLongest = 1;
        newLastActive = now;
        chillFocusTelemetryService.logStreakEarned(userId, newCurrent);
      } else {
        const lastDateStr = new Date(streak.lastActiveDate).toISOString().slice(0, 10);

        if (lastDateStr !== todayDateStr) {
          // Calculate difference in calendar days
          const lastDateObj = new Date(lastDateStr);
          const todayDateObj = new Date(todayDateStr);
          const diffDays = Math.round((todayDateObj.getTime() - lastDateObj.getTime()) / (1000 * 60 * 60 * 24));

          if (diffDays === 1) {
            // Consecutive day credit
            newCurrent = streak.currentStreakDays + 1;
          } else if (diffDays > 1) {
            // Missed a day -> reset streak to 1
            newCurrent = 1;
          }

          if (newCurrent > newLongest) {
            newLongest = newCurrent;
          }

          newLastActive = now;
          chillFocusTelemetryService.logStreakEarned(userId, newCurrent);
        }
      }
    }

    const updated = await chillFocusRepository.updateStreak(userId, {
      currentStreakDays: newCurrent,
      longestStreakDays: newLongest,
      lastActiveDate: newLastActive,
      totalSessionsCompleted: newTotalSessions
    });

    const todayStr = new Date().toISOString().slice(0, 10);
    const updatedLastStr = updated.lastActiveDate ? new Date(updated.lastActiveDate).toISOString().slice(0, 10) : null;

    return {
      userId: updated.userId,
      currentStreakDays: updated.currentStreakDays,
      longestStreakDays: updated.longestStreakDays,
      lastActiveDate: updated.lastActiveDate ? new Date(updated.lastActiveDate).toISOString() : null,
      totalSessionsCompleted: updated.totalSessionsCompleted,
      earnedToday: updatedLastStr === todayStr
    };
  }
}

export const chillFocusStreakService = new ChillFocusStreakService();
