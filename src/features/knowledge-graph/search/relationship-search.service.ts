import { knowledgeGraphRepository } from '../knowledge-graph.repository';
import { GraphQueryOptions } from '../knowledge-graph.types';
import { KnowledgeRelationship } from '@prisma/client';

export class RelationshipSearchService {
  public async searchRelationships(options: GraphQueryOptions): Promise<KnowledgeRelationship[]> {
    return knowledgeGraphRepository.findRelationships(options);
  }
}

export const relationshipSearchService = new RelationshipSearchService();
