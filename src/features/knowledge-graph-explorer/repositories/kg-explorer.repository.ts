import { prisma } from '@/lib/prisma';
import { KnowledgeEntity, KnowledgeRelationship, Prisma } from '@prisma/client';
import { RagExecutionContext } from '@/features/rag/performance/rag-execution-context';
import { ExplorerFilters, ResolvedExplorerScope } from '../types/kg-explorer.types';

/**
 * New, additive repository for the Explorer's read-mostly queries. Does NOT touch/import the
 * existing `KnowledgeGraphRepository` (src/features/knowledge-graph/knowledge-graph.repository.ts)
 * and does not change its behavior in any way.
 *
 * CRITICAL scoping rule (intentional, additive fix — see Phase 84 brief): the existing repository
 * always ANDs `userId` onto every query, even when a `projectId` is supplied, which means a second
 * authorized project member can never see a teammate's entities today. Here, for `PROJECT` scope
 * (only ever reached AFTER `knowledgeGraphRBAC.canViewGraph` has authorized it upstream in the
 * service), we deliberately query `WHERE projectId = ... AND status = 'ACTIVE'` WITHOUT anding
 * `userId` — this is what finally makes that RBAC check meaningful. `PRIVATE` and
 * `KNOWLEDGE_BASE` scope remain strictly owner-scoped (`userId`), matching the existing semantics.
 */
export class KgExplorerRepository {
  private buildEntityScopeWhere(ctx: ResolvedExplorerScope): Prisma.KnowledgeEntityWhereInput {
    const where: Prisma.KnowledgeEntityWhereInput = { status: 'ACTIVE' };
    if (ctx.scope === 'PROJECT') {
      where.projectId = ctx.projectId as string;
    } else if (ctx.scope === 'KNOWLEDGE_BASE') {
      where.userId = ctx.userId;
      where.knowledgeBaseId = ctx.knowledgeBaseId as string;
    } else {
      where.userId = ctx.userId;
    }
    return where;
  }

  /**
   * `KnowledgeRelationship` has no `knowledgeBaseId` column (confirmed in prisma/schema.prisma),
   * so for KNOWLEDGE_BASE scope we fall back to owner-scoping (KBs are owner-only, no sharing in
   * this schema) and rely on the caller filtering the returned edges down to ones whose endpoints
   * are both present in an already-scoped entity id set (see KgExplorerService.buildGraphResponse
   * and expandNeighborhood below) to prevent leaking a relationship that happens to touch a
   * different knowledge base of the same user.
   */
  private buildRelationshipScopeWhere(ctx: ResolvedExplorerScope): Prisma.KnowledgeRelationshipWhereInput {
    const where: Prisma.KnowledgeRelationshipWhereInput = { status: 'ACTIVE' };
    if (ctx.scope === 'PROJECT') {
      where.projectId = ctx.projectId as string;
    } else {
      where.userId = ctx.userId;
    }
    return where;
  }

  public async findEntitiesInScope(
    ctx: ResolvedExplorerScope,
    filters: ExplorerFilters & { searchQuery?: string },
    maxResults: number
  ): Promise<KnowledgeEntity[]> {
    const where = this.buildEntityScopeWhere(ctx);

    if (filters.entityTypes && filters.entityTypes.length > 0) {
      where.entityType = { in: filters.entityTypes };
    }
    if (filters.minConfidence !== undefined) {
      where.confidence = { gte: filters.minConfidence };
    }
    if (filters.searchQuery && filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase().trim().slice(0, 500);
      where.OR = [
        { canonicalName: { contains: q, mode: 'insensitive' } },
        { normalizedName: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } }
      ];
    }

    return prisma.knowledgeEntity.findMany({
      where,
      take: Math.max(1, maxResults),
      orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }]
    });
  }

  public async findRelationshipsInScope(
    ctx: ResolvedExplorerScope,
    filters: Pick<ExplorerFilters, 'relationshipTypes' | 'minConfidence'>,
    maxResults: number
  ): Promise<KnowledgeRelationship[]> {
    const where = this.buildRelationshipScopeWhere(ctx);

    if (filters.relationshipTypes && filters.relationshipTypes.length > 0) {
      where.relationshipType = { in: filters.relationshipTypes };
    }
    if (filters.minConfidence !== undefined) {
      where.confidence = { gte: filters.minConfidence };
    }

    return prisma.knowledgeRelationship.findMany({
      where,
      take: Math.max(1, maxResults),
      orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }]
    });
  }

  /**
   * Bounded, multi-seed BFS neighborhood expansion, scoped per the rule documented above. Mirrors
   * the visited-set/frontier algorithm of the existing `getEntityNeighborhood`, generalized to
   * multiple seeds and hard-capped at `maxNodes`/`maxEdges`, checking `execCtx.hasExpired()` before
   * starting each hop so a soft deadline yields a partial, flagged result rather than a hang.
   */
  public async expandNeighborhood(
    seedEntityIds: string[],
    ctx: ResolvedExplorerScope,
    depth: number,
    maxNodes: number,
    maxEdges: number,
    execCtx: RagExecutionContext
  ): Promise<{
    entities: KnowledgeEntity[];
    relationships: KnowledgeRelationship[];
    truncated: boolean;
    truncationReason?: 'MAX_NODES' | 'MAX_EDGES' | 'TIMEOUT';
  }> {
    const entityWhere = this.buildEntityScopeWhere(ctx);
    const relWhere = this.buildRelationshipScopeWhere(ctx);

    const foundEntities = new Map<string, KnowledgeEntity>();
    const foundRelationshipIds = new Set<string>();
    const foundRelationships: KnowledgeRelationship[] = [];
    let truncated = false;
    let truncationReason: 'MAX_NODES' | 'MAX_EDGES' | 'TIMEOUT' | undefined;

    if (seedEntityIds.length === 0) {
      return { entities: [], relationships: [], truncated: false };
    }

    const seedEntities = await prisma.knowledgeEntity.findMany({
      where: { ...entityWhere, id: { in: seedEntityIds } }
    });
    for (const e of seedEntities) foundEntities.set(e.id, e);

    let frontier = seedEntities.map((e) => e.id);
    const visited = new Set<string>(frontier);

    const boundedDepth = Math.min(Math.max(depth, 1), 3);

    for (let hop = 0; hop < boundedDepth; hop++) {
      if (frontier.length === 0) break;

      if (execCtx.hasExpired()) {
        truncated = true;
        truncationReason = 'TIMEOUT';
        break;
      }

      const rels = await prisma.knowledgeRelationship.findMany({
        where: {
          ...relWhere,
          OR: [{ sourceEntityId: { in: frontier } }, { targetEntityId: { in: frontier } }]
        },
        take: 500
      });

      const neighborCandidateIds = new Set<string>();
      for (const rel of rels) {
        const isSourceInFrontier = frontier.includes(rel.sourceEntityId);
        const neighborId = isSourceInFrontier ? rel.targetEntityId : rel.sourceEntityId;
        if (!visited.has(neighborId)) {
          neighborCandidateIds.add(neighborId);
        }
      }

      let neighborEntities: KnowledgeEntity[] = [];
      if (neighborCandidateIds.size > 0) {
        neighborEntities = await prisma.knowledgeEntity.findMany({
          where: { ...entityWhere, id: { in: Array.from(neighborCandidateIds) } }
        });
      }
      const validNeighborIds = new Set(neighborEntities.map((e) => e.id));

      // Only keep an edge if both endpoints are (or will be) in the authorized found-entity set —
      // this is the defense-in-depth check that prevents leaking a relationship whose other end
      // sits outside the authorized scope (e.g. a different knowledge base of the same user).
      let nodeCapHit = false;
      let edgeCapHit = false;

      for (const rel of rels) {
        const isSourceInFrontier = frontier.includes(rel.sourceEntityId);
        const otherEnd = isSourceInFrontier ? rel.targetEntityId : rel.sourceEntityId;
        const otherEndAuthorized = foundEntities.has(otherEnd) || validNeighborIds.has(otherEnd);
        if (!otherEndAuthorized) continue;
        if (foundRelationshipIds.has(rel.id)) continue;

        if (foundRelationships.length >= maxEdges) {
          edgeCapHit = true;
          continue;
        }
        foundRelationshipIds.add(rel.id);
        foundRelationships.push(rel);
      }

      const nextFrontier: string[] = [];
      for (const ne of neighborEntities) {
        if (foundEntities.has(ne.id)) continue;
        if (foundEntities.size >= maxNodes) {
          nodeCapHit = true;
          break;
        }
        foundEntities.set(ne.id, ne);
        visited.add(ne.id);
        nextFrontier.push(ne.id);
      }

      if (nodeCapHit) {
        truncated = true;
        truncationReason = truncationReason ?? 'MAX_NODES';
      }
      if (edgeCapHit) {
        truncated = true;
        truncationReason = truncationReason ?? 'MAX_EDGES';
      }

      if (nodeCapHit || edgeCapHit) break;

      frontier = nextFrontier;
    }

    return {
      entities: Array.from(foundEntities.values()),
      relationships: foundRelationships,
      truncated,
      truncationReason
    };
  }
}

export const kgExplorerRepository = new KgExplorerRepository();
