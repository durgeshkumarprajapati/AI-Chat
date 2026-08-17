import { StudyDifficulty } from '../study.types';
import { STUDY_CONFIG } from '../study.constants';

export class StudyAdaptiveEngineService {
  public calculateMasteryScore(attempted: number, correct: number, totalScore: number): number {
    if (attempted === 0) return 0;
    const avgScorePct = (totalScore / (attempted * 10)) * 100;
    const accuracyPct = (correct / attempted) * 100;
    return Math.min(100, Math.round((avgScorePct * 0.6 + accuracyPct * 0.4) * 10) / 10);
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
