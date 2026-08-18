import { prisma } from '@/lib/prisma';
import {
  KnowledgeEntity,
  KnowledgeRelationship,
  KnowledgeEvidence,
  KnowledgeClaim,
  KnowledgeGraphJob,
  KnowledgeEntityType,
  KnowledgeRelationshipType,
  GraphJobStatus,
  Prisma
} from '@prisma/client';
import { GraphQueryOptions } from './knowledge-graph.types';

export class KnowledgeGraphRepository {
  public async upsertEntity(data: {
    userId: string;
    projectId?: string | null;
    knowledgeBaseId?: string | null;
    canonicalName: string;
    normalizedName: string;
    entityType: KnowledgeEntityType;
    description?: string | null;
    aliases?: string[];
    confidence?: number;
    metadata?: any;
  }): Promise<KnowledgeEntity> {
    const existing = await prisma.knowledgeEntity.findFirst({
      where: {
        userId: data.userId,
        projectId: data.projectId ?? null,
        normalizedName: data.normalizedName
      }
    });

    if (existing) {
      const mergedAliases = Array.from(
        new Set([
          ...(Array.isArray(existing.aliases) ? (existing.aliases as string[]) : []),
          ...(data.aliases || []),
          data.canonicalName
        ])
      );

      return prisma.knowledgeEntity.update({
        where: { id: existing.id },
        data: {
          aliases: mergedAliases,
          description: data.description || existing.description,
          confidence: Math.max(existing.confidence, data.confidence ?? 1.0),
          updatedAt: new Date()
        }
      });
    }

    return prisma.knowledgeEntity.create({
      data: {
        userId: data.userId,
        projectId: data.projectId ?? null,
        knowledgeBaseId: data.knowledgeBaseId ?? null,
        canonicalName: data.canonicalName,
        normalizedName: data.normalizedName,
        entityType: data.entityType,
        description: data.description ?? null,
        aliases: data.aliases || [data.canonicalName],
        confidence: data.confidence ?? 1.0,
        metadata: data.metadata || {}
      }
    });
  }

  public async upsertRelationship(data: {
    userId: string;
    projectId?: string | null;
    sourceEntityId: string;
    targetEntityId: string;
    relationshipType: KnowledgeRelationshipType;
    description?: string | null;
    confidence?: number;
    fingerprint: string;
    metadata?: any;
  }): Promise<KnowledgeRelationship> {
    const existing = await prisma.knowledgeRelationship.findFirst({
      where: {
        userId: data.userId,
        projectId: data.projectId ?? null,
        fingerprint: data.fingerprint
      }
    });

    if (existing) {
      return prisma.knowledgeRelationship.update({
        where: { id: existing.id },
        data: {
          confidence: Math.max(existing.confidence, data.confidence ?? 1.0),
          description: data.description || existing.description,
          updatedAt: new Date()
        }
      });
    }

    return prisma.knowledgeRelationship.create({
      data: {
        userId: data.userId,
        projectId: data.projectId ?? null,
        sourceEntityId: data.sourceEntityId,
        targetEntityId: data.targetEntityId,
        relationshipType: data.relationshipType,
        description: data.description ?? null,
        confidence: data.confidence ?? 1.0,
        fingerprint: data.fingerprint,
        metadata: data.metadata || {}
      }
    });
  }

  public async createEvidence(data: {
    entityId?: string | null;
    relationshipId?: string | null;
    claimId?: string | null;
    documentId: string;
    chunkId: string;
    pageNumber?: number | null;
    sourceTextHash: string;
    snippet?: string | null;
    confidence?: number;
  }): Promise<KnowledgeEvidence> {
    return prisma.knowledgeEvidence.create({
      data: {
        entityId: data.entityId ?? null,
        relationshipId: data.relationshipId ?? null,
        claimId: data.claimId ?? null,
        documentId: data.documentId,
        chunkId: data.chunkId,
        pageNumber: data.pageNumber ?? null,
        sourceTextHash: data.sourceTextHash,
        snippet: data.snippet ?? null,
        confidence: data.confidence ?? 1.0
      }
    });
  }

  public async upsertClaim(data: {
    userId: string;
    projectId?: string | null;
    subjectEntityId: string;
    predicate: string;
    objectEntityId?: string | null;
    value?: string | null;
    normalizedClaim: string;
    confidence?: number;
  }): Promise<KnowledgeClaim> {
    const existing = await prisma.knowledgeClaim.findFirst({
      where: {
        userId: data.userId,
        projectId: data.projectId ?? null,
        normalizedClaim: data.normalizedClaim
      }
    });

    if (existing) {
      return prisma.knowledgeClaim.update({
        where: { id: existing.id },
        data: {
          confidence: Math.max(existing.confidence, data.confidence ?? 1.0),
          updatedAt: new Date()
        }
      });
    }

    return prisma.knowledgeClaim.create({
      data: {
        userId: data.userId,
        projectId: data.projectId ?? null,
        subjectEntityId: data.subjectEntityId,
        predicate: data.predicate,
        objectEntityId: data.objectEntityId ?? null,
        value: data.value ?? null,
        normalizedClaim: data.normalizedClaim,
        confidence: data.confidence ?? 1.0
      }
    });
  }

  public async findEntities(options: GraphQueryOptions): Promise<KnowledgeEntity[]> {
    const where: Prisma.KnowledgeEntityWhereInput = {
      userId: options.userId,
      status: 'ACTIVE'
    };

    if (options.projectId) {
      where.projectId = options.projectId;
    }
    if (options.knowledgeBaseId) {
      where.knowledgeBaseId = options.knowledgeBaseId;
    }
    if (options.entityTypes && options.entityTypes.length > 0) {
      where.entityType = { in: options.entityTypes };
    }
    if (options.minConfidence !== undefined) {
      where.confidence = { gte: options.minConfidence };
    }
    if (options.searchQuery) {
      const q = options.searchQuery.toLowerCase().trim();
      where.OR = [
        { canonicalName: { contains: q, mode: 'insensitive' } },
        { normalizedName: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } }
      ];
    }

    return prisma.knowledgeEntity.findMany({
      where,
      take: options.maxNodes || 100,
      orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }]
    });
  }

  public async findRelationships(options: GraphQueryOptions): Promise<KnowledgeRelationship[]> {
    const where: Prisma.KnowledgeRelationshipWhereInput = {
      userId: options.userId,
      status: 'ACTIVE'
    };

    if (options.projectId) {
      where.projectId = options.projectId;
    }
    if (options.relationshipTypes && options.relationshipTypes.length > 0) {
      where.relationshipType = { in: options.relationshipTypes };
    }
    if (options.minConfidence !== undefined) {
      where.confidence = { gte: options.minConfidence };
    }

    return prisma.knowledgeRelationship.findMany({
      where,
      take: options.maxNodes || 200,
      orderBy: [{ confidence: 'desc' }, { createdAt: 'desc' }]
    });
  }

  public async getEntityNeighborhood(
    entityId: string,
    options: GraphQueryOptions
  ): Promise<{ entities: KnowledgeEntity[]; relationships: KnowledgeRelationship[] }> {
    const depth = Math.min(Math.max(options.depth || 1, 1), 3);
    const visitedEntityIds = new Set<string>([entityId]);
    const foundEntities: KnowledgeEntity[] = [];
    const foundRelationships: KnowledgeRelationship[] = [];

    const rootEntity = await prisma.knowledgeEntity.findFirst({
      where: { id: entityId, userId: options.userId, status: 'ACTIVE' }
    });
    if (!rootEntity) {
      return { entities: [], relationships: [] };
    }
    foundEntities.push(rootEntity);

    let currentFrontier = [entityId];

    for (let d = 0; d < depth; d++) {
      if (currentFrontier.length === 0) break;

      const rels = await prisma.knowledgeRelationship.findMany({
        where: {
          userId: options.userId,
          status: 'ACTIVE',
          OR: [
            { sourceEntityId: { in: currentFrontier } },
            { targetEntityId: { in: currentFrontier } }
          ]
        },
        take: 100
      });

      const nextFrontier: string[] = [];

      for (const rel of rels) {
        foundRelationships.push(rel);
        const neighborId = currentFrontier.includes(rel.sourceEntityId)
          ? rel.targetEntityId
          : rel.sourceEntityId;

        if (!visitedEntityIds.has(neighborId)) {
          visitedEntityIds.add(neighborId);
          nextFrontier.push(neighborId);
        }
      }

      if (nextFrontier.length > 0) {
        const neighborEntities = await prisma.knowledgeEntity.findMany({
          where: {
            id: { in: nextFrontier },
            userId: options.userId,
            status: 'ACTIVE'
          }
        });
        foundEntities.push(...neighborEntities);
      }

      currentFrontier = nextFrontier;
    }

    return { entities: foundEntities, relationships: foundRelationships };
  }

  public async createJob(data: {
    userId: string;
    projectId?: string | null;
    documentId?: string | null;
    knowledgeBaseId?: string | null;
    metadata?: any;
  }): Promise<KnowledgeGraphJob> {
    return prisma.knowledgeGraphJob.create({
      data: {
        userId: data.userId,
        projectId: data.projectId ?? null,
        documentId: data.documentId ?? null,
        knowledgeBaseId: data.knowledgeBaseId ?? null,
        status: 'PENDING',
        metadata: data.metadata || {}
      }
    });
  }

  public async updateJobStatus(
    jobId: string,
    status: GraphJobStatus,
    error?: { code?: string; message?: string }
  ): Promise<KnowledgeGraphJob> {
    return prisma.knowledgeGraphJob.update({
      where: { id: jobId },
      data: {
        status,
        startedAt: status === 'PROCESSING' ? new Date() : undefined,
        completedAt: status === 'COMPLETED' || status === 'FAILED' ? new Date() : undefined,
        errorCode: error?.code,
        errorMessage: error?.message
      }
    });
  }

  public async removeDocumentEvidence(documentId: string): Promise<{
    removedEvidencesCount: number;
    cleanedEntitiesCount: number;
    cleanedRelationshipsCount: number;
  }> {
    const evidences = await prisma.knowledgeEvidence.findMany({
      where: { documentId }
    });

    const entityIds = Array.from(new Set(evidences.map((e) => e.entityId).filter(Boolean))) as string[];
    const relationshipIds = Array.from(new Set(evidences.map((e) => e.relationshipId).filter(Boolean))) as string[];

    const deleteResult = await prisma.knowledgeEvidence.deleteMany({
      where: { documentId }
    });

    let cleanedEntities = 0;
    for (const eid of entityIds) {
      const remaining = await prisma.knowledgeEvidence.count({ where: { entityId: eid } });
      if (remaining === 0) {
        await prisma.knowledgeEntity.delete({ where: { id: eid } }).catch(() => {});
        cleanedEntities++;
      }
    }

    let cleanedRelationships = 0;
    for (const rid of relationshipIds) {
      const remaining = await prisma.knowledgeEvidence.count({ where: { relationshipId: rid } });
      if (remaining === 0) {
        await prisma.knowledgeRelationship.delete({ where: { id: rid } }).catch(() => {});
        cleanedRelationships++;
      }
    }

    return {
      removedEvidencesCount: deleteResult.count,
      cleanedEntitiesCount: cleanedEntities,
      cleanedRelationshipsCount: cleanedRelationships
    };
  }
}

export const knowledgeGraphRepository = new KnowledgeGraphRepository();
