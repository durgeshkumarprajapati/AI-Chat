import { RoadmapStatus, SharePermission } from '@prisma/client';

export type GoalOption =
  | 'Learn a Technology'
  | 'Prepare for an Interview'
  | 'Build a Project'
  | 'Career Change'
  | 'Improve Skills'
  | 'Prepare for Certification';

export type ExperienceLevelOption = 'Beginner' | 'Intermediate' | 'Advanced';

export type DailyTimeOption = '30 minutes/day' | '1 hour/day' | '2 hours/day' | '3+ hours/day';

export type LearningStyleOption = 'Theory first' | 'Project based' | 'Balanced' | 'Practice first';

export interface QuestionnaireAnswers {
  goal: string;
  targetSkill: string;
  experienceLevel: string;
  dailyTimeCommitment: string;
  targetDurationWeeks: number;
  learningStyle: string;
  additionalContext?: string;
  interviewTargetRole?: string;
  certificationType?: string;
}

export interface ResourceRecommendation {
  title: string;
  url: string;
  snippet?: string;
  sourceType?: 'OFFICIAL_DOCS' | 'TUTORIAL' | 'WEB_RESOURCE';
}

export interface GeneratedTask {
  title: string;
  description: string;
  estimatedHours: number;
  resources?: ResourceRecommendation[];
}

export interface GeneratedPhase {
  title: string;
  description: string;
  durationWeeks: number;
  tasks: GeneratedTask[];
}

export interface GeneratedRoadmapPlan {
  title: string;
  description: string;
  targetSkill: string;
  targetDurationWeeks: number;
  phases: GeneratedPhase[];
}

export interface RoadmapTaskDTO {
  id: string;
  phaseId: string;
  title: string;
  description: string;
  order: number;
  estimatedHours: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  completedAt?: Date | string | null;
  notes?: string | null;
  resources?: ResourceRecommendation[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface RoadmapPhaseDTO {
  id: string;
  roadmapId: string;
  title: string;
  description: string;
  order: number;
  durationWeeks: number;
  status: string;
  tasks: RoadmapTaskDTO[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface RoadmapShareDTO {
  id: string;
  roadmapId: string;
  ownerId: string;
  sharedWithUserId: string;
  sharedWithEmail?: string;
  sharedWithName?: string;
  permission: SharePermission;
  revokedAt?: Date | string | null;
  expiresAt?: Date | string | null;
  createdAt: Date | string;
}

export interface RoadmapDTO {
  id: string;
  userId: string;
  title: string;
  description: string;
  goal: string;
  targetSkill: string;
  experienceLevel: string;
  dailyTimeCommitment: string;
  targetDurationWeeks: number;
  learningStyle: string;
  status: RoadmapStatus;
  currentProgress: number;
  generationVersion: number;
  questionnaireSnapshot: QuestionnaireAnswers;
  phases: RoadmapPhaseDTO[];
  shares?: RoadmapShareDTO[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface RoadmapShareCreateInput {
  targetUserEmail: string;
  permission: SharePermission;
  expiresInDays?: number;
}
