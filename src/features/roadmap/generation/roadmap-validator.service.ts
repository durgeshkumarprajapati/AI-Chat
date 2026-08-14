import { GeneratedRoadmapPlan, GeneratedPhase, GeneratedTask } from '../roadmap.types';
import { ROADMAP_CONFIG } from '../roadmap.constants';
import { ValidationError } from '@/errors';

export class RoadmapValidatorService {
  /**
   * Validates and normalizes structured JSON roadmap plan output.
   */
  validateAndNormalizePlan(raw: unknown, targetDurationWeeks: number): GeneratedRoadmapPlan {
    if (!raw || typeof raw !== 'object') {
      throw new ValidationError('AI generated output is not a valid JSON object.');
    }

    const obj = raw as Record<string, unknown>;

    const title = String(obj.title || '').trim();
    if (!title || title.length < 3 || title.length > 150) {
      throw new ValidationError('Generated roadmap title must be between 3 and 150 characters.');
    }

    const description = String(obj.description || '').trim();
    if (!description || description.length < 10 || description.length > 1000) {
      throw new ValidationError('Generated roadmap description must be between 10 and 1000 characters.');
    }

    const targetSkill = String(obj.targetSkill || title).trim();

    if (!Array.isArray(obj.phases) || obj.phases.length === 0) {
      throw new ValidationError('Roadmap must contain at least 1 phase.');
    }

    if (obj.phases.length > ROADMAP_CONFIG.MAX_PHASES) {
      throw new ValidationError(`Roadmap exceeds maximum allowed phases (${ROADMAP_CONFIG.MAX_PHASES}).`);
    }

    let totalTasksCount = 0;
    const validatedPhases: GeneratedPhase[] = [];

    obj.phases.forEach((pRaw, phaseIdx) => {
      if (!pRaw || typeof pRaw !== 'object') {
        throw new ValidationError(`Phase at index ${phaseIdx} is invalid.`);
      }

      const pObj = pRaw as Record<string, unknown>;
      const pTitle = String(pObj.title || `Phase ${phaseIdx + 1}`).trim();
      const pDesc = String(pObj.description || `Overview of ${pTitle}`).trim();
      const pDuration = Math.max(1, Number(pObj.durationWeeks) || 1);

      if (!Array.isArray(pObj.tasks) || pObj.tasks.length === 0) {
        throw new ValidationError(`Phase "${pTitle}" must contain at least 1 task.`);
      }

      if (pObj.tasks.length > ROADMAP_CONFIG.MAX_TASKS_PER_PHASE) {
        throw new ValidationError(
          `Phase "${pTitle}" exceeds max tasks per phase limit (${ROADMAP_CONFIG.MAX_TASKS_PER_PHASE}).`
        );
      }

      const validatedTasks: GeneratedTask[] = [];

      pObj.tasks.forEach((tRaw, taskIdx) => {
        if (!tRaw || typeof tRaw !== 'object') {
          throw new ValidationError(`Task at index ${taskIdx} in phase "${pTitle}" is invalid.`);
        }

        const tObj = tRaw as Record<string, unknown>;
        const tTitle = String(tObj.title || `Task ${taskIdx + 1}`).trim();
        const tDesc = String(tObj.description || `Complete ${tTitle}`).trim();
        const estHours = Math.max(0.5, Math.min(40, Number(tObj.estimatedHours) || 2));

        const resourcesRaw = Array.isArray(tObj.resources) ? tObj.resources : [];
        const resources: GeneratedTask['resources'] = resourcesRaw
          .filter((r) => r && typeof r === 'object')
          .map((r: any) => ({
            title: String(r.title || 'Official Documentation').slice(0, 100),
            url: String(r.url || 'https://docs.python.org').slice(0, 500),
            snippet: r.snippet ? String(r.snippet).slice(0, 300) : undefined,
            sourceType: (r.sourceType === 'OFFICIAL_DOCS' ? 'OFFICIAL_DOCS' : 'TUTORIAL') as 'OFFICIAL_DOCS' | 'TUTORIAL'
          }));

        validatedTasks.push({
          title: tTitle,
          description: tDesc,
          estimatedHours: estHours,
          resources
        });
      });

      totalTasksCount += validatedTasks.length;

      validatedPhases.push({
        title: pTitle,
        description: pDesc,
        durationWeeks: pDuration,
        tasks: validatedTasks
      });
    });

    if (totalTasksCount > ROADMAP_CONFIG.MAX_TOTAL_TASKS) {
      throw new ValidationError(`Roadmap total tasks (${totalTasksCount}) exceeds max limit (${ROADMAP_CONFIG.MAX_TOTAL_TASKS}).`);
    }

    return {
      title,
      description,
      targetSkill,
      targetDurationWeeks: targetDurationWeeks || 4,
      phases: validatedPhases
    };
  }
}

export const roadmapValidatorService = new RoadmapValidatorService();
