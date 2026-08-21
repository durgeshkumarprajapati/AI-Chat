import { ChillFocusMode, ChillFocusStatus } from '@prisma/client';

export type BreathingPhase = 'INHALE' | 'HOLD' | 'EXHALE' | 'REST';

export interface BreathingPreset {
  name: string;
  inhaleSeconds: number;
  holdSeconds: number;
  exhaleSeconds: number;
  restSeconds: number;
}

export interface SoundscapeDefinition {
  id: string;
  name: string;
  icon: string;
  description: string;
  audioUrl: string;
  loop: boolean;
  defaultVolume: number;
}

export interface CreateChillFocusSessionInput {
  mode?: ChillFocusMode;
  plannedDurationSeconds?: number;
  soundscape?: string;
}

export interface ChillFocusSessionDTO {
  id: string;
  userId: string;
  mode: ChillFocusMode;
  status: ChillFocusStatus;
  startedAt: string;
  pausedAt?: string | null;
  resumedAt?: string | null;
  completedAt?: string | null;
  plannedDurationSeconds: number;
  activeDurationSeconds: number;
  soundscape: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChillFocusPreferenceDTO {
  id: string;
  userId: string;
  preferredMode: string;
  preferredSoundscape: string;
  preferredVolume: number;
  breathingEnabled: boolean;
  interventionEnabled: boolean;
  reducedMotion: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateChillFocusPreferenceInput {
  preferredMode?: string;
  preferredSoundscape?: string;
  preferredVolume?: number;
  breathingEnabled?: boolean;
  interventionEnabled?: boolean;
  reducedMotion?: boolean;
}

export interface CalmStreakSummaryDTO {
  userId: string;
  currentStreakDays: number;
  longestStreakDays: number;
  lastActiveDate?: string | null;
  totalSessionsCompleted: number;
  earnedToday: boolean;
}

export interface AIInterventionResult {
  message: string;
  suggestionMinutes: number;
  source: 'ai' | 'fallback';
}
