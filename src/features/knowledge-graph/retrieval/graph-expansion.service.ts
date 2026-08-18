import { graphRetrievalService } from './graph-retrieval.service';
import { GraphQueryOptions, GraphSubgraph } from '../knowledge-graph.types';
import { env } from '@/config/env';

export class GraphExpansionService {
  private readonly maxExpansionDepth = env.server?.KNOWLEDGE_GRAPH_MAX_EXPANSION_DEPTH ?? 3;

  public async expandEntity(entityId: string, options: GraphQueryOptions): Promise<GraphSubgraph> {
    const requestedDepth = options.depth || 2;
    const boundedDepth = Math.min(Math.max(requestedDepth, 1), this.maxExpansionDepth);

    return graphRetrievalService.getEntityNeighborhood(entityId, {
      ...options,
      depth: boundedDepth
    });
  }
}

export const graphExpansionService = new GraphExpansionService();
