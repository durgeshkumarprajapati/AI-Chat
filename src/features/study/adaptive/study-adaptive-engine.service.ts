import { StudyDifficulty } from '../study.types';
import { STUDY_CONFIG } from '../study.constants';

export class StudyAdaptiveEngineService {
  public calculateMasteryScore(attempted: number, correct: number, totalScore: number): number {
    if (attempted === 0) return 0;
    const avgScorePct = (totalScore / (attempted * 10)) * 100;
    const accuracyPct = (correct / attempted) * 100;
    return Math.min(100, Math.round((avgScorePct * 0.6 + accuracyPct * 0.4) * 10) / 10);
  }

  /**
   * Determine next difficulty level based on rolling performance of recent attempts (last 5).
   */
  public determineAdaptiveDifficultyFromHistory(recentScores: number[], currentDifficulty: StudyDifficulty): StudyDifficulty {
    if (!recentScores || recentScores.length === 0) {
      return currentDifficulty;
    }

    // Take up to last 5 attempts
    const last5 = recentScores.slice(-5);
    const avgPct = (last5.reduce((sum, s) => sum + s, 0) / (last5.length * 10)) * 100;

    if (avgPct < 40) {
      return StudyDifficulty.BEGINNER;
    }
    if (avgPct <= 70) {
      return StudyDifficulty.INTERMEDIATE;
    }
    return StudyDifficulty.ADVANCED;
  }

  public determineNextDifficulty(masteryScore: number, _currentDifficulty: StudyDifficulty): StudyDifficulty {
    if (masteryScore < STUDY_CONFIG.LOW_MASTERY_THRESHOLD) {
      return StudyDifficulty.BEGINNER;
    }
    if (masteryScore < STUDY_CONFIG.HIGH_MASTERY_THRESHOLD) {
      return StudyDifficulty.INTERMEDIATE;
    }
    return StudyDifficulty.ADVANCED;
  }

  public calculateNextReviewDate(masteryScore: number): Date {
    const now = new Date();
    let days = 1;

    if (masteryScore < STUDY_CONFIG.LOW_MASTERY_THRESHOLD) {
      days = 1;
    } else if (masteryScore < STUDY_CONFIG.HIGH_MASTERY_THRESHOLD) {
      days = 3;
    } else {
      days = 7;
    }

    return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  }

  public getAdaptiveRecommendation(masteryScore: number, topicTitle: string): string {
    if (masteryScore < STUDY_CONFIG.LOW_MASTERY_THRESHOLD) {
      return `Focus on fundamental concepts of "${topicTitle}". Mastery is currently ${masteryScore}%.`;
    }
    if (masteryScore < STUDY_CONFIG.HIGH_MASTERY_THRESHOLD) {
      return `Practice scenario-based questions for "${topicTitle}". Mastery is at ${masteryScore}%.`;
    }
    return `Great job! You have mastered "${topicTitle}" with ${masteryScore}% mastery score. Ready to advance!`;
  }
}

export const studyAdaptiveEngineService = new StudyAdaptiveEngineService();
