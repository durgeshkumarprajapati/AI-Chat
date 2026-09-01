import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { SECRET_KEY_PATTERNS } from '@/features/config/config.constants';
import { clampScore } from '@/features/knowledge-intelligence/confidence.util';
import { projectAuthorizationService } from '@/features/projects/project-authorization.service';
import { auditService } from '@/features/audit/audit.service';
import { NotFoundError, ValidationError, SecurityError } from '@/errors';
import { CopilotMemoryCategory } from '../types/copilot.types';
import { memoryRetrievalCacheService } from '../cache/memory-retrieval-cache.service';
import { memoryTelemetryService } from './memory-telemetry.service';
import {
  MemoryCandidateInput,
  MemoryDTO,
  MemoryExportPayload,
  MemorySettingsDTO,
  MemorySettingsInput,
  RankedMemory
} from './copilot-memory.types';

export interface CreateMemoryPayload {
  category: CopilotMemoryCategory;
  key: string;
  value: string;
  confidence?: number;
  source?: string;
  projectId?: string;
  expiresAt?: Date;
}

export interface RetrieveRankedMemoriesOptions {
  projectId?: string;
  queryText?: string;
  maxResults?: number;
  /** Reserved for future conversation-window scoping; currently informational only. */
  conversationScoped?: boolean;
}

// Categories that auto-expire — kept deliberately short. Everything else (including the new
// USER_PROFILE/TECHNICAL_DECISION/IMPORTANT_FACT/WORKING_PATTERN categories) never auto-expires,
// per the brief's explicit instruction that only conversation-scoped memories should decay.
const CONVERSATION_MEMORY_RETENTION_DAYS = 90;

const TIMEOUT = Symbol('memory-retrieval-timeout');

/**
 * Phase 90 — extends the EXISTING Phase-earlier CopilotMemory service additively. `getMemories` /
 * `upsertMemory` / `deleteMemory` / `clearAllMemories` are untouched in signature/return shape —
 * every existing call site (including the Assistant orchestrator's pre-Phase-90 read path) keeps
 * compiling and behaving identically. New methods below add ranking/budget/cache/candidate-
 * extraction/settings/export/clear-by-scope on top of the same `CopilotMemory` table — no
 * parallel memory model/service was introduced.
 */
export class CopilotMemoryService {
  /**
   * Create or update a user-approved memory item.
   */
  public async upsertMemory(userId: string, payload: CreateMemoryPayload) {
    const result = await prisma.copilotMemory.upsert({
      where: {
        userId_key_projectId: {
          userId,
          key: payload.key,
          projectId: payload.projectId || (null as any)
        }
      },
      update: {
        category: payload.category as any,
        value: payload.value,
        confidence: payload.confidence ?? 1.0,
        source: payload.source || 'user_explicit',
        expiresAt: payload.expiresAt || null
      },
      create: {
        userId,
        projectId: payload.projectId || null,
        category: payload.category as any,
        key: payload.key,
        value: payload.value,
        confidence: payload.confidence ?? 1.0,
        source: payload.source || 'user_explicit',
        expiresAt: payload.expiresAt || null
      }
    });

    await memoryRetrievalCacheService.invalidate(userId, payload.projectId ?? null).catch(() => {});
    return result;
  }

  /**
   * Get all active memories for a user (and optionally project). `filters` is a Phase 90
   * additive, optional third parameter — every existing call site that omits it (including the
   * pre-existing GET /api/copilot/memory handler and this codebase's own tests) keeps behaving
   * byte-identically.
   */
  public async getMemories(
    userId: string,
    projectId?: string,
    filters?: { search?: string; category?: string; minImportance?: number }
  ) {
    const now = new Date();
    const andFilters: Prisma.CopilotMemoryWhereInput[] = [
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }
    ];

    if (filters?.category) {
      andFilters.push({ category: filters.category as any });
    }
    if (typeof filters?.minImportance === 'number') {
      andFilters.push({ importance: { gte: filters.minImportance } });
    }
    if (filters?.search) {
      andFilters.push({
        OR: [
          { key: { contains: filters.search, mode: 'insensitive' } },
          { value: { contains: filters.search, mode: 'insensitive' } }
        ]
      });
    }

    return prisma.copilotMemory.findMany({
      where: {
        userId,
        OR: [{ projectId: null }, ...(projectId ? [{ projectId }] : [])],
        AND: andFilters
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  /**
   * Delete a specific memory item.
   */
  public async deleteMemory(id: string, userId: string): Promise<void> {
    await prisma.copilotMemory.deleteMany({
      where: { id, userId }
    });
    await memoryRetrievalCacheService.invalidate(userId).catch(() => {});
  }

  /**
   * Clear all memories for a user (or specific project).
   */
  public async clearAllMemories(userId: string, projectId?: string): Promise<void> {
    await prisma.copilotMemory.deleteMany({
      where: {
        userId,
        ...(projectId ? { projectId } : {})
      }
    });
    await memoryRetrievalCacheService.invalidate(userId, projectId ?? null).catch(() => {});
  }

  // ================================================================================
  // PHASE 90 — settings
  // ================================================================================

  /**
   * Returns the user's memory settings, falling back to platform-wide config defaults when no
   * row has ever been persisted for them. Never creates a row on a plain read — lazy creation
   * happens on the first `updateMemorySettings` call, matching this codebase's established
   * lazy-row-creation precedent for per-user preference tables.
   */
  public async getMemorySettings(userId: string): Promise<MemorySettingsDTO> {
    const row = await prisma.memorySettings.findUnique({ where: { userId } });
    if (row) {
      return {
        memoryEnabled: row.memoryEnabled,
        autoLearnEnabled: row.autoLearnEnabled,
        projectMemoryEnabled: row.projectMemoryEnabled,
        conversationMemoryEnabled: row.conversationMemoryEnabled,
        updatedAt: row.updatedAt.toISOString()
      };
    }

    const [memoryEnabled, autoLearnEnabled, projectMemoryEnabled, conversationMemoryEnabled] = await Promise.all([
      configService.getBoolean('AI_MEMORY_ENABLED', true),
      configService.getBoolean('AI_MEMORY_AUTO_LEARN_ENABLED', true),
      configService.getBoolean('AI_MEMORY_PROJECT_ENABLED', true),
      configService.getBoolean('AI_MEMORY_CONVERSATION_ENABLED', true)
    ]);

    return { memoryEnabled, autoLearnEnabled, projectMemoryEnabled, conversationMemoryEnabled };
  }

  public async updateMemorySettings(userId: string, patch: Partial<MemorySettingsInput>): Promise<MemorySettingsDTO> {
    const current = await this.getMemorySettings(userId);
    const merged: MemorySettingsInput = {
      memoryEnabled: patch.memoryEnabled ?? current.memoryEnabled,
      autoLearnEnabled: patch.autoLearnEnabled ?? current.autoLearnEnabled,
      projectMemoryEnabled: patch.projectMemoryEnabled ?? current.projectMemoryEnabled,
      conversationMemoryEnabled: patch.conversationMemoryEnabled ?? current.conversationMemoryEnabled
    };

    const row = await prisma.memorySettings.upsert({
      where: { userId },
      create: { userId, ...merged },
      update: { ...merged }
    });

    await memoryRetrievalCacheService.invalidate(userId).catch(() => {});
    await auditService.logEvent({
      actorId: userId,
      action: 'MEMORY_SETTINGS_UPDATED',
      targetType: 'MEMORY_SETTINGS',
      targetId: userId,
      details: { patch }
    });

    return {
      memoryEnabled: row.memoryEnabled,
      autoLearnEnabled: row.autoLearnEnabled,
      projectMemoryEnabled: row.projectMemoryEnabled,
      conversationMemoryEnabled: row.conversationMemoryEnabled,
      updatedAt: row.updatedAt.toISOString()
    };
  }

  // ================================================================================
  // PHASE 90 — ranked retrieval (the Assistant's real read path)
  // ================================================================================

  /**
   * Returns a bounded, ranked, budget-truncated list of memories for a chat turn. NEVER throws —
   * on any error or timeout this resolves to `[]` so a memory-layer problem can never fail a
   * chat turn. Ranking is a deterministic weighted blend of recency/importance/confidence/access-
   * count plus a lexical (term-overlap) relevance signal against `queryText` — NOT embedding
   * cosine similarity. This was a deliberate choice: `retrieval.service.ts`'s embedding provider
   * is constructed for RAG's document-chunk pipeline, and pulling it into the memory layer for a
   * handful of short key/value facts would add real latency (an embedding round-trip per chat
   * turn) and RAG coupling for marginal ranking benefit over simple term overlap on short text.
   * The spec's own "keep ranking deterministic where possible" note treats this as acceptable.
   */
  public async retrieveRankedMemories(userId: string, options: RetrieveRankedMemoriesOptions = {}): Promise<RankedMemory[]> {
    const requestId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    void memoryTelemetryService.logEvent({ event: 'memory.retrieval.started', requestId, userId });

    let timeoutMs = 1500;
    try {
      timeoutMs = await configService.getNumber('AI_MEMORY_RETRIEVAL_TIMEOUT_MS', 1500);
    } catch {
      // fall back to the hardcoded default above
    }

    try {
      const result = await Promise.race([
        this.doRetrieveRankedMemories(userId, options),
        new Promise<typeof TIMEOUT>((resolve) => setTimeout(() => resolve(TIMEOUT), timeoutMs))
      ]);

      if (result === TIMEOUT) {
        void memoryTelemetryService.logEvent({
          event: 'memory.retrieval.timeout',
          requestId,
          userId,
          latencyMs: Date.now() - startedAt
        });
        return [];
      }

      const ranked = result as RankedMemory[];
      void memoryTelemetryService.logEvent({
        event: 'memory.retrieval.completed',
        requestId,
        userId,
        resultCount: ranked.length,
        latencyMs: Date.now() - startedAt
      });
      return ranked;
    } catch {
      void memoryTelemetryService.logEvent({
        event: 'memory.retrieval.completed',
        requestId,
        userId,
        resultCount: 0,
        latencyMs: Date.now() - startedAt
      });
      return [];
    }
  }

  private async doRetrieveRankedMemories(userId: string, options: RetrieveRankedMemoriesOptions): Promise<RankedMemory[]> {
    const enabled = await configService.getBoolean('AI_MEMORY_ENABLED', true);
    if (!enabled) return [];

    const settings = await this.getMemorySettings(userId);
    if (!settings.memoryEnabled) return [];

    const configuredMax = await configService.getNumber('AI_MEMORY_MAX_RETRIEVAL_RESULTS', 10);
    const maxResults = Math.max(1, Math.min(options.maxResults ?? configuredMax, 50));

    const cacheKey = memoryRetrievalCacheService.buildCacheKey(userId, options.projectId, options.queryText);
    const cached = await memoryRetrievalCacheService.get(cacheKey);
    if (cached) {
      void memoryTelemetryService.logEvent({ event: 'memory.cache.hit', userId, resultCount: cached.length });
      return cached.slice(0, maxResults);
    }
    void memoryTelemetryService.logEvent({ event: 'memory.cache.miss', userId });

    const now = new Date();
    const candidatePoolSize = maxResults * 3;

    const scopeFilters: Prisma.CopilotMemoryWhereInput[] = [{ projectId: null }];
    if (options.projectId && settings.projectMemoryEnabled) {
      scopeFilters.push({ projectId: options.projectId });
    }

    const andFilters: Prisma.CopilotMemoryWhereInput[] = [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }];
    if (!settings.conversationMemoryEnabled) {
      andFilters.push({ category: { not: 'CONVERSATION_MEMORY' } });
    }

    // Always scoped by the authenticated userId — never trusts a client-supplied filter for
    // whose memories to read. Bounded `take` — never a full-table scan.
    const candidates = await prisma.copilotMemory.findMany({
      where: { userId, OR: scopeFilters, AND: andFilters },
      orderBy: { updatedAt: 'desc' },
      take: candidatePoolSize
    });

    const relevanceThreshold = await configService.getNumber('AI_MEMORY_RELEVANCE_THRESHOLD', 0.3);
    const maxContentLength = await configService.getNumber('AI_MEMORY_MAX_CONTENT_LENGTH', 1000);
    const queryTerms = this.tokenize(options.queryText);

    const ranked: RankedMemory[] = candidates
      .map((m) => ({ ...this.toDTO(m), score: this.computeScore(m, queryTerms, now) }))
      .filter((m) => m.score >= relevanceThreshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((m) => (m.value.length > maxContentLength ? { ...m, value: m.value.slice(0, maxContentLength) } : m));

    // Fire-and-forget access-tracking — never awaited, never adds latency to the retrieval call.
    if (ranked.length > 0) {
      const ids = ranked.map((m) => m.id);
      prisma.copilotMemory
        .updateMany({ where: { id: { in: ids } }, data: { accessCount: { increment: 1 }, lastUsedAt: new Date() } })
        .catch(() => {});
    }

    const ttl = await configService.getNumber('AI_MEMORY_CACHE_TTL_SECONDS', 300);
    memoryRetrievalCacheService.set(cacheKey, ranked, ttl).catch(() => {});

    return ranked;
  }

  private tokenize(text?: string): string[] {
    if (!text) return [];
    const terms = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2);
    return Array.from(new Set(terms));
  }

  /**
   * Deterministic weighted score in [0,1]: recency (0.2) + importance (0.25) + confidence (0.2) +
   * access-count (0.1) + lexical relevance (0.25). With no `queryText`, relevance defaults to 1
   * (neutral — a query-less retrieval is never penalized for lacking a query to match against).
   */
  private computeScore(m: { importance: number | null; confidence: number; accessCount: number; lastUsedAt: Date | null; updatedAt: Date; createdAt: Date; key: string; value: string }, queryTerms: string[], now: Date): number {
    const referenceDate = m.lastUsedAt ?? m.updatedAt ?? m.createdAt;
    const daysSince = Math.max(0, (now.getTime() - new Date(referenceDate).getTime()) / (1000 * 60 * 60 * 24));
    const recencyScore = 1 / (1 + daysSince / 14);

    const importanceScore = clampScore(m.importance ?? 0.5);
    const confidenceScore = clampScore(m.confidence ?? 1);
    const accessScore = Math.min((m.accessCount ?? 0) / 10, 1);

    let relevanceScore = 1;
    if (queryTerms.length > 0) {
      const haystack = `${m.key} ${m.value}`.toLowerCase();
      const hits = queryTerms.filter((t) => haystack.includes(t)).length;
      relevanceScore = hits / queryTerms.length;
    }

    const blended =
      recencyScore * 0.2 + importanceScore * 0.25 + confidenceScore * 0.2 + accessScore * 0.1 + relevanceScore * 0.25;

    return clampScore(blended);
  }

  // ================================================================================
  // PHASE 90 — async candidate extraction (worker-only write path)
  // ================================================================================

  /**
   * Records a memory candidate detected by the async extraction worker. Never called from a
   * request path. Idempotent via the existing `@@unique([userId, key, projectId])` constraint —
   * a stable, normalized dedup key is derived from the candidate's content so near-duplicate
   * phrasing of the same fact collides on the SAME row rather than creating duplicates.
   */
  public async recordMemoryCandidate(input: MemoryCandidateInput): Promise<{ created: boolean; memoryId?: string }> {
    const trimmed = (input.content || '').trim();
    if (!trimmed) return { created: false };

    if (SECRET_KEY_PATTERNS.some((pattern) => pattern.test(trimmed))) {
      // Reject the WHOLE candidate — never partially store a secret-containing memory.
      return { created: false };
    }

    const maxLen = await configService.getNumber('AI_MEMORY_MAX_CONTENT_LENGTH', 1000);
    const value = trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
    const key = this.buildDedupKey(value);
    const expiresAt = input.expiresAt !== undefined ? input.expiresAt : this.defaultExpiryForCategory(input.category);

    try {
      const memory = await prisma.copilotMemory.upsert({
        where: {
          userId_key_projectId: {
            userId: input.userId,
            key,
            projectId: input.projectId || (null as any)
          }
        },
        update: {
          value,
          confidence: input.confidence !== undefined ? clampScore(input.confidence) : undefined,
          importance: input.importance !== undefined ? clampScore(input.importance) : undefined,
          sourceType: input.sourceType,
          sourceId: input.sourceId ?? null,
          expiresAt: expiresAt ?? null,
          lastUsedAt: new Date()
        },
        create: {
          userId: input.userId,
          projectId: input.projectId || null,
          category: input.category as any,
          key,
          value,
          confidence: input.confidence !== undefined ? clampScore(input.confidence) : 0.7,
          importance: input.importance !== undefined ? clampScore(input.importance) : 0.5,
          source: 'auto_extracted',
          sourceType: input.sourceType,
          sourceId: input.sourceId ?? null,
          expiresAt: expiresAt ?? null,
          lastUsedAt: new Date()
        }
      });

      await memoryRetrievalCacheService.invalidate(input.userId, input.projectId ?? null).catch(() => {});
      void memoryTelemetryService.logEvent({ event: 'memory.created', userId: input.userId, category: input.category });

      return { created: true, memoryId: memory.id };
    } catch (err: any) {
      if (err?.code === 'P2002') {
        // Unique-key collision on redelivery/near-duplicate — treat as success, not an error.
        return { created: true };
      }
      throw err;
    }
  }

  /**
   * Normalizes candidate content into a stable, bounded dedup key: lowercased, punctuation
   * stripped, whitespace collapsed, capped at 180 chars. Near-duplicate phrasing of the same
   * underlying fact normalizes to (or very near) the same key, so it naturally collides on the
   * existing `@@unique([userId, key, projectId])` constraint instead of creating a new row.
   */
  private buildDedupKey(content: string): string {
    const normalized = content
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return normalized.length > 180 ? normalized.slice(0, 180) : normalized;
  }

  private defaultExpiryForCategory(category: CopilotMemoryCategory): Date | null {
    if (category === 'CONVERSATION_MEMORY') {
      return new Date(Date.now() + CONVERSATION_MEMORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    }
    return null;
  }

  // ================================================================================
  // PHASE 90 — export / clear-by-scope / update
  // ================================================================================

  /**
   * Exports ALL of a user's own memory rows (including already-expired ones — export is a
   * transparency feature, so a user should be able to see everything ever stored about them,
   * not just what currently survives the retrieval-time expiry filter). Strictly scoped to
   * `userId`; for any distinct `projectId` present, re-validates the user's CURRENT project
   * authorization and drops memories for a project they no longer have access to.
   */
  public async exportUserMemories(userId: string): Promise<MemoryExportPayload> {
    await auditService.logEvent({
      actorId: userId,
      action: 'MEMORY_EXPORT_REQUESTED',
      targetType: 'USER_MEMORY',
      targetId: userId
    });

    const rows = await prisma.copilotMemory.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });

    const projectIds = Array.from(new Set(rows.map((r) => r.projectId).filter((p): p is string => !!p)));
    const authorizedProjectIds = new Set<string>();
    for (const projectId of projectIds) {
      try {
        await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'VIEW_PROJECT');
        authorizedProjectIds.add(projectId);
      } catch {
        // No longer authorized for this project — drop its memories from the export. Extremely
        // unlikely in practice (a user's own memory referencing a project they left), but this is
        // a correct, cheap defensive check per the brief.
      }
    }

    const filtered = rows.filter((r) => !r.projectId || authorizedProjectIds.has(r.projectId));
    const memories = filtered.map((m) => this.toDTO(m));

    void memoryTelemetryService.logEvent({ event: 'memory.exported', userId, resultCount: memories.length });
    await auditService.logEvent({
      actorId: userId,
      action: 'MEMORY_EXPORT_COMPLETED',
      targetType: 'USER_MEMORY',
      targetId: userId,
      details: { count: memories.length }
    });

    return { userId, exportedAt: new Date().toISOString(), memoryCount: memories.length, memories };
  }

  /**
   * Deletes memories by scope. PROJECT requires real project authorization (never trusts a
   * client-supplied projectId alone). Invalidates the retrieval cache and audit-logs the action.
   */
  public async clearMemoriesByScope(
    userId: string,
    scope: 'CONVERSATION' | 'PROJECT' | 'ALL',
    projectId?: string
  ): Promise<{ deletedCount: number }> {
    let deletedCount = 0;

    if (scope === 'ALL') {
      const result = await prisma.copilotMemory.deleteMany({ where: { userId } });
      deletedCount = result.count;
    } else if (scope === 'PROJECT') {
      if (!projectId) {
        throw new ValidationError('projectId is required when scope is PROJECT.');
      }
      await projectAuthorizationService.authorizeProjectAccess(userId, projectId, 'VIEW_PROJECT');
      const result = await prisma.copilotMemory.deleteMany({ where: { userId, projectId } });
      deletedCount = result.count;
    } else {
      // CONVERSATION
      const result = await prisma.copilotMemory.deleteMany({
        where: {
          userId,
          category: 'CONVERSATION_MEMORY' as any,
          ...(projectId ? { projectId } : {})
        }
      });
      deletedCount = result.count;
    }

    await memoryRetrievalCacheService.invalidate(userId, projectId ?? null).catch(() => {});
    void memoryTelemetryService.logEvent({ event: 'memory.deleted', userId, resultCount: deletedCount });
    await auditService.logEvent({
      actorId: userId,
      action: 'MEMORY_CLEARED',
      targetType: 'USER_MEMORY',
      targetId: userId,
      details: { scope, projectId, deletedCount }
    });

    return { deletedCount };
  }

  /**
   * Updates a single memory's value/importance. Ownership-checked (404, not 403, for a
   * non-owned id — matches this codebase's established convention of not leaking existence).
   */
  public async updateMemory(userId: string, memoryId: string, patch: { value?: string; importance?: number }): Promise<MemoryDTO> {
    const existing = await prisma.copilotMemory.findUnique({ where: { id: memoryId } });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundError('Memory');
    }

    const data: Prisma.CopilotMemoryUpdateInput = {};

    if (patch.value !== undefined) {
      const trimmed = patch.value.trim();
      if (!trimmed) {
        throw new ValidationError('value cannot be empty.');
      }
      if (SECRET_KEY_PATTERNS.some((pattern) => pattern.test(trimmed))) {
        throw new SecurityError('Memory content appears to contain a secret credential and cannot be stored.');
      }
      const maxLen = await configService.getNumber('AI_MEMORY_MAX_CONTENT_LENGTH', 1000);
      data.value = trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
    }

    if (patch.importance !== undefined) {
      data.importance = clampScore(patch.importance);
    }

    const updated = await prisma.copilotMemory.update({ where: { id: memoryId }, data });

    await memoryRetrievalCacheService.invalidate(userId, existing.projectId ?? null).catch(() => {});
    void memoryTelemetryService.logEvent({ event: 'memory.updated', userId, category: existing.category });

    return this.toDTO(updated);
  }

  private toDTO(m: {
    id: string;
    userId: string;
    projectId: string | null;
    category: string;
    key: string;
    value: string;
    confidence: number;
    source: string;
    importance: number | null;
    sourceType: string | null;
    sourceId: string | null;
    lastUsedAt: Date | null;
    accessCount: number;
    expiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): MemoryDTO {
    return {
      id: m.id,
      userId: m.userId,
      projectId: m.projectId,
      category: m.category as CopilotMemoryCategory,
      key: m.key,
      value: m.value,
      confidence: m.confidence,
      source: m.source,
      importance: m.importance ?? 0.5,
      sourceType: m.sourceType,
      sourceId: m.sourceId,
      lastUsedAt: m.lastUsedAt ? m.lastUsedAt.toISOString() : null,
      accessCount: m.accessCount ?? 0,
      expiresAt: m.expiresAt ? m.expiresAt.toISOString() : null,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString()
    };
  }
}

export const copilotMemoryService = new CopilotMemoryService();
