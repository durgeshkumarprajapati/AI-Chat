import { prisma } from '@/lib/prisma';

export interface ReviewPriorityTopic {
  topicId: string;
  topicTitle: string;
  topicDescription: string;
  masteryScore: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  attemptedCount: number;
  correctCount: number;
  nextReviewAt?: Date;
}

export class ReviewModeService {
  /**
   * Calculate adaptive review priorities for all topics in a session.
   */
  public async getReviewTopics(sessionId: string): Promise<ReviewPriorityTopic[]> {
    const topics = await prisma.studyTopic.findMany({
      where: { sessionId },
      include: {
        progresses: { where: { sessionId } },
        questions: { include: { answers: { where: { sessionId } } } }
      },
      orderBy: { order: 'asc' }
    });

    const result: ReviewPriorityTopic[] = [];

    for (const t of topics) {
      const prog = t.progresses[0];
      const masteryScore = prog?.masteryScore ?? t.masteryScore ?? 0;
      const attemptedCount = prog?.attemptedQuestions ?? 0;
      const correctCount = prog?.correctAnswers ?? 0;
      const nextReviewAt = prog?.nextReviewAt || undefined;

      let priority: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
      let reason = 'Mastery is on track (> 70%). Regular review recommended.';

      if (masteryScore < 40) {
        priority = 'HIGH';
        reason = `Low mastery (${masteryScore.toFixed(0)}%). High priority review required.`;
      } else if (masteryScore <= 70) {
        priority = 'MEDIUM';
        reason = `Moderate mastery (${masteryScore.toFixed(0)}%). Spaced review recommended.`;
      }

      result.push({
        topicId: t.id,
        topicTitle: t.title,
        topicDescription: t.description,
        masteryScore,
        priority,
        reason,
        attemptedCount,
        correctCount,
        nextReviewAt
      });
    }

    // Sort by priority (HIGH -> MEDIUM -> LOW) and then by lowest masteryScore
    const priorityWeight = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    result.sort((a, b) => {
      const weightDiff = priorityWeight[b.priority] - priorityWeight[a.priority];
      if (weightDiff !== 0) return weightDiff;
      return a.masteryScore - b.masteryScore;
    });

    return result;
  }
}

export const reviewModeService = new ReviewModeService();
