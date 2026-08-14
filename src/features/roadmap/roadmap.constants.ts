export const ROADMAP_CONFIG = {
  ENABLED: process.env.ROADMAP_ENABLED !== 'false',
  MAX_PHASES: parseInt(process.env.ROADMAP_MAX_PHASES || '12', 10),
  MAX_TASKS_PER_PHASE: parseInt(process.env.ROADMAP_MAX_TASKS_PER_PHASE || '30', 10),
  MAX_TOTAL_TASKS: parseInt(process.env.ROADMAP_MAX_TOTAL_TASKS || '150', 10),
  MAX_GENERATION_RETRIES: parseInt(process.env.ROADMAP_MAX_GENERATION_RETRIES || '2', 10),
  AI_TIMEOUT_MS: parseInt(process.env.ROADMAP_AI_TIMEOUT_MS || '30000', 10),
  CACHE_ENABLED: process.env.ROADMAP_CACHE_ENABLED !== 'false'
};

export const ALLOWED_GOALS = [
  'Learn a Technology',
  'Prepare for an Interview',
  'Build a Project',
  'Career Change',
  'Improve Skills',
  'Prepare for Certification'
] as const;

export const ALLOWED_EXPERIENCE_LEVELS = ['Beginner', 'Intermediate', 'Advanced'] as const;

export const ALLOWED_DAILY_TIMES = ['30 minutes/day', '1 hour/day', '2 hours/day', '3+ hours/day'] as const;

export const ALLOWED_DURATIONS = [4, 8, 12, 24, 52] as const;

export const ALLOWED_LEARNING_STYLES = ['Theory first', 'Project based', 'Balanced', 'Practice first'] as const;
