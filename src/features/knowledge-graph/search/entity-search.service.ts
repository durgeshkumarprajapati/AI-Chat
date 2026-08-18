import { knowledgeGraphRepository } from '../knowledge-graph.repository';
import { GraphQueryOptions } from '../knowledge-graph.types';
import { KnowledgeEntity } from '@prisma/client';

export class EntitySearchService {
  public async searchEntities(options: GraphQueryOptions): Promise<KnowledgeEntity[]> {
    return knowledgeGraphRepository.findEntities(options);
  }
}

export const entitySearchService = new EntitySearchService();
