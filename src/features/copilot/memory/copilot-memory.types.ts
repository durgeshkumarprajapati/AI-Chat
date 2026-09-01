import { CopilotMemoryCategory } from '../types/copilot.types';

/**
 * Phase 90 — AI Memory, Personalization & Adaptive Intelligence.
 *
 * Shared contract types for the memory engine. Kept in their own file (rather than folded into
 * the pre-existing `types/copilot.types.ts`) since this is a large, self-contained addition and
 * the sibling settings-UI work depends on `MemorySettingsDTO`/`MemorySettingsInput` specifically —
 * a dedicated file keeps that contract easy to find.
 */

export interface MemorySettingsDTO {
  memoryEnabled: boolean;
  autoLearnEnabled: boolean;
  projectMemoryEnabled: boolean;
  conversationMemoryEnabled: boolean;
  /** Present only once a settings row has actually been persisted (see lazy-creation note). */
  updatedAt?: string;
}

export interface MemorySettingsInput {
  memoryEnabled: boolean;
  autoLearnEnabled: boolean;
  projectMemoryEnabled: boolean;
  conversationMemoryEnabled: boolean;
}

export interface MemoryDTO {
  id: string;
  userId: string;
  projectId: string | null;
  category: CopilotMemoryCategory;
  key: string;
  value: string;
  confidence: number;
  source: string;
  importance: number;
  sourceType: string | null;
  sourceId: string | null;
  lastUsedAt: string | null;
  accessCount: number;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RankedMemory extends MemoryDTO {
  /** Final blended 0-1 ranking score this memory was returned with (recency+importance+confidence+access+relevance). */
  score: number;
}

export interface MemoryCandidateInput {
  userId: string;
  projectId?: string | null;
  category: CopilotMemoryCategory;
  /** Raw candidate text — recordMemoryCandidate derives a normalized dedup key from this. */
  content: string;
  confidence?: number;
  importance?: number;
  sourceType: string;
  sourceId?: string | null;
  /** Explicit expiry; if omitted, a category-appropriate default retention is applied. */
  expiresAt?: Date | null;
}

export interface MemoryExportPayload {
  userId: string;
  exportedAt: string;
  memoryCount: number;
  memories: MemoryDTO[];
}
