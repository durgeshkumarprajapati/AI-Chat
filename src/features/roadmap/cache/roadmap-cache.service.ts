import { redis } from '@/lib/redis';
import { QuestionnaireAnswers, GeneratedRoadmapPlan } from '../roadmap.types';
import { ROADMAP_CONFIG } from '../roadmap.constants';
import crypto from 'crypto';

export class RoadmapCacheService {
  /**
   * Generates user-scoped cache key for questionnaire fingerprint.
   */
  private generateCacheKey(userId: string, answers: QuestionnaireAnswers): string {
    const fingerprint = crypto
      .createHash('sha256')
      .update(JSON.stringify(answers))
      .digest('hex');
    return `roadmap:cache:user:${userId}:fp:${fingerprint}`;
  }

  async getCachedPlan(userId: string, answers: QuestionnaireAnswers): Promise<GeneratedRoadmapPlan | null> {
    if (!ROADMAP_CONFIG.CACHE_ENABLED) return null;
    try {
      const key = this.generateCacheKey(userId, answers);
      return await redis.getJson<GeneratedRoadmapPlan>(key);
    } catch {}
    return null;
  }

  async setCachedPlan(userId: string, answers: QuestionnaireAnswers, plan: GeneratedRoadmapPlan, ttlSeconds = 86400): Promise<void> {
    if (!ROADMAP_CONFIG.CACHE_ENABLED) return;
    try {
      const key = this.generateCacheKey(userId, answers);
      await redis.setJson(key, plan, ttlSeconds);
    } catch {}
  }

  async invalidateUserCache(userId: string): Promise<void> {
    try {
      const key = `roadmap:cache:user:${userId}:*`;
      await redis.del(key);
    } catch {}
  }
}

export const roadmapCacheService = new RoadmapCacheService();
