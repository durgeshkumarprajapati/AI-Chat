import { QUESTIONNAIRE_STEPS } from './roadmap-questionnaire';
import { QuestionnaireAnswers } from '../roadmap.types';
import { ValidationError } from '@/errors';
import {
  ALLOWED_GOALS,
  ALLOWED_EXPERIENCE_LEVELS,
  ALLOWED_DAILY_TIMES,
  ALLOWED_DURATIONS,
  ALLOWED_LEARNING_STYLES
} from '../roadmap.constants';

export class QuestionnaireService {
  /**
   * Returns all questionnaire steps, evaluating conditional rules if answers context provided.
   */
  getQuestionnaireSteps(answersContext?: Partial<QuestionnaireAnswers>) {
    return QUESTIONNAIRE_STEPS.filter((step) => {
      if (!step.conditional) return true;
      if (!answersContext) return false;
      const parentVal = answersContext[step.conditional.dependsOnKey as keyof QuestionnaireAnswers];
      return parentVal === step.conditional.showIfValue;
    });
  }

  /**
   * Server-side validation for submitted questionnaire answers.
   */
  validateAnswers(raw: unknown): QuestionnaireAnswers {
    if (!raw || typeof raw !== 'object') {
      throw new ValidationError('Questionnaire payload must be an object.');
    }

    const payload = raw as Record<string, unknown>;

    // 1. Goal
    const goal = String(payload.goal || '').trim();
    if (!goal || !ALLOWED_GOALS.includes(goal as any)) {
      throw new ValidationError(`Invalid goal selected. Must be one of: ${ALLOWED_GOALS.join(', ')}`);
    }

    // 2. Target Skill
    const targetSkill = String(payload.targetSkill || '').trim();
    if (!targetSkill || targetSkill.length < 2 || targetSkill.length > 100) {
      throw new ValidationError('Target skill must be between 2 and 100 characters.');
    }

    // 3. Experience Level
    const experienceLevel = String(payload.experienceLevel || '').trim();
    if (!experienceLevel || !ALLOWED_EXPERIENCE_LEVELS.includes(experienceLevel as any)) {
      throw new ValidationError(`Invalid experience level. Must be one of: ${ALLOWED_EXPERIENCE_LEVELS.join(', ')}`);
    }

    // 4. Daily Time Commitment
    const dailyTimeCommitment = String(payload.dailyTimeCommitment || '').trim();
    if (!dailyTimeCommitment || !ALLOWED_DAILY_TIMES.includes(dailyTimeCommitment as any)) {
      throw new ValidationError(`Invalid daily time commitment. Must be one of: ${ALLOWED_DAILY_TIMES.join(', ')}`);
    }

    // 5. Target Duration Weeks
    const targetDurationWeeks = Number(payload.targetDurationWeeks);
    if (isNaN(targetDurationWeeks) || !ALLOWED_DURATIONS.includes(targetDurationWeeks as any)) {
      throw new ValidationError(`Invalid target duration weeks. Must be one of: ${ALLOWED_DURATIONS.join(', ')}`);
    }

    // 6. Learning Style
    const learningStyle = String(payload.learningStyle || '').trim();
    if (!learningStyle || !ALLOWED_LEARNING_STYLES.includes(learningStyle as any)) {
      throw new ValidationError(`Invalid learning style. Must be one of: ${ALLOWED_LEARNING_STYLES.join(', ')}`);
    }

    // Sanitize optional fields
    const additionalContext = payload.additionalContext ? String(payload.additionalContext).slice(0, 500) : undefined;
    const interviewTargetRole = payload.interviewTargetRole ? String(payload.interviewTargetRole).slice(0, 100) : undefined;
    const certificationType = payload.certificationType ? String(payload.certificationType).slice(0, 100) : undefined;

    return {
      goal,
      targetSkill,
      experienceLevel,
      dailyTimeCommitment,
      targetDurationWeeks,
      learningStyle,
      additionalContext,
      interviewTargetRole,
      certificationType
    };
  }
}

export const questionnaireService = new QuestionnaireService();
