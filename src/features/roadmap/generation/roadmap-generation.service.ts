import { questionnaireService } from '../questionnaire/roadmap-questionnaire.service';
import { roadmapPlannerService } from './roadmap-planner.service';
import { roadmapCacheService } from '../cache/roadmap-cache.service';
import { roadmapRepository } from '../repository/roadmap.repository';
import { RoadmapDTO } from '../roadmap.types';
import { prisma } from '@/lib/prisma';

export class RoadmapGenerationService {
  /**
   * Complete workflow: validate questionnaire -> check cache -> plan -> persist -> audit log.
   */
  async generateAndPersistRoadmap(userId: string, rawAnswers: unknown): Promise<RoadmapDTO> {
    // 1. Validate questionnaire answers
    const answers = questionnaireService.validateAnswers(rawAnswers);

    // 2. Check user cache
    const cachedPlan = await roadmapCacheService.getCachedPlan(userId, answers);

    let plan = cachedPlan;
    if (!plan) {
      // 3. Plan roadmap using catalog + AI
      plan = await roadmapPlannerService.planRoadmap(answers);
      await roadmapCacheService.setCachedPlan(userId, answers, plan);
    }

    // 4. Persist in database
    const saved = await roadmapRepository.createRoadmap(userId, answers, plan);

    // 5. Create audit log
    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'roadmap.created',
        targetType: 'Roadmap',
        targetId: saved.id,
        details: { title: saved.title, targetSkill: saved.targetSkill }
      }
    }).catch(() => {});

    return saved as unknown as RoadmapDTO;
  }
}

export const roadmapGenerationService = new RoadmapGenerationService();
