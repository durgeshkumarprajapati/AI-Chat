import { knowledgeGraphRepository } from '../knowledge-graph.repository';
import { GraphQueryOptions, GraphSubgraph } from '../knowledge-graph.types';
import { prisma } from '@/lib/prisma';

export class GraphRetrievalService {
  public async retrieveSubgraph(options: GraphQueryOptions): Promise<GraphSubgraph> {
    const entities = await knowledgeGraphRepository.findEntities(options);
    const relationships = await knowledgeGraphRepository.findRelationships(options);

    const entityIds = entities.map((e) => e.id);
    const relationshipIds = relationships.map((r) => r.id);

    const evidenceCount = await prisma.knowledgeEvidence.count({
      where: {
        OR: [
          { entityId: { in: entityIds } },
          { relationshipId: { in: relationshipIds } }
        ]
      }
    });

    const conflictsCount = await prisma.knowledgeConflict.count({
      where: {
        userId: options.userId,
        projectId: options.projectId ?? undefined,
        status: 'UNRESOLVED'
      }
    });

    return {
      nodes: entities.map((e) => ({
        id: e.id,
        canonicalName: e.canonicalName,
        entityType: e.entityType,
        description: e.description,
        aliases: Array.isArray(e.aliases) ? (e.aliases as string[]) : [],
        confidence: e.confidence,
        status: e.status,
        projectId: e.projectId
      })),
      edges: relationships.map((r) => ({
        id: r.id,
        sourceEntityId: r.sourceEntityId,
        targetEntityId: r.targetEntityId,
        relationshipType: r.relationshipType,
        description: r.description,
        confidence: r.confidence,
        status: r.status,
        fingerprint: r.fingerprint
      })),
      evidenceCount,
      conflictsCount
    };
  }

  public async getEntityNeighborhood(
    entityId: string,
    options: GraphQueryOptions
  ): Promise<GraphSubgraph> {
    const { entities, relationships } = await knowledgeGraphRepository.getEntityNeighborhood(entityId, options);

    return {
      nodes: entities.map((e) => ({
        id: e.id,
        canonicalName: e.canonicalName,
        entityType: e.entityType,
        description: e.description,
        aliases: Array.isArray(e.aliases) ? (e.aliases as string[]) : [],
        confidence: e.confidence,
        status: e.status,
        projectId: e.projectId
      })),
      edges: relationships.map((r) => ({
        id: r.id,
        sourceEntityId: r.sourceEntityId,
        targetEntityId: r.targetEntityId,
        relationshipType: r.relationshipType,
        description: r.description,
        confidence: r.confidence,
        status: r.status,
        fingerprint: r.fingerprint
      })),
      evidenceCount: entities.length,
      conflictsCount: 0
    };
  }
}

export const graphRetrievalService = new GraphRetrievalService();
