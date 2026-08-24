import { prisma } from '@/lib/prisma';
import { RetrievedChunk, RetrievalOptions } from './retrieval.types';

export class GraphRetriever {
  public async retrieve(
    userId: string,
    query: string,
    _options?: RetrievalOptions
  ): Promise<RetrievedChunk[]> {
    if (!query || !query.trim()) return [];

    try {
      const terms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 3);

      if (terms.length === 0) return [];

      // Find Knowledge Entities belonging to userId
      const entities = await prisma.knowledgeEntity.findMany({
        where: {
          userId,
          OR: terms.map((term) => ({
            OR: [
              { canonicalName: { contains: term, mode: 'insensitive' } },
              { normalizedName: { contains: term, mode: 'insensitive' } },
              { description: { contains: term, mode: 'insensitive' } }
            ]
          }))
        },
        take: 10
      });

      if (entities.length === 0) return [];

      const entityIds = entities.map((e) => e.id);

      // Find relationships connected to these entities
      const relationships = await prisma.knowledgeRelationship.findMany({
        where: {
          userId,
          OR: [
            { sourceEntityId: { in: entityIds } },
            { targetEntityId: { in: entityIds } }
          ]
        },
        take: 15,
        include: {
          sourceEntity: { select: { canonicalName: true, entityType: true } },
          targetEntity: { select: { canonicalName: true, entityType: true } }
        }
      });

      const chunks: RetrievedChunk[] = [];

      for (const entity of entities) {
        const relatedRels = relationships.filter(
          (r) => r.sourceEntityId === entity.id || r.targetEntityId === entity.id
        );

        const relSummaries = relatedRels
          .map(
            (r) =>
              `${r.sourceEntity.canonicalName} (${r.sourceEntity.entityType}) --[${r.relationshipType}]--> ${r.targetEntity.canonicalName} (${r.targetEntity.entityType})`
          )
          .join('; ');

        const graphContent = `[Entity Graph Context] Name: ${entity.canonicalName} | Type: ${
          entity.entityType
        } | Description: ${entity.description || 'N/A'}${
          relSummaries ? ` | Relationships: ${relSummaries}` : ''
        }`;

        chunks.push({
          id: `graph-entity-${entity.id}`,
          documentId: `doc-graph-${entity.id}`,
          filename: 'KnowledgeGraph',
          chunkIndex: 0,
          pageNumber: 1,
          content: graphContent,
          tokenCount: Math.ceil(graphContent.length / 4),
          similarity: 0.85,
          retrievalSource: 'keyword',
          sourceType: 'DOCUMENT',
          metadata: {
            entityId: entity.id,
            entityName: entity.canonicalName,
            entityType: entity.entityType,
            graphType: 'ENTITY'
          }
        });
      }

      return chunks;
    } catch {
      return [];
    }
  }
}

export const graphRetriever = new GraphRetriever();
