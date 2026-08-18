import { GraphRAGCandidate } from '../knowledge-graph.types';

export class GraphRankerService {
  public rankCandidates(candidates: GraphRAGCandidate[]): GraphRAGCandidate[] {
    if (candidates.length === 0) return [];

    return [...candidates].sort((a, b) => {
      // 1. Primary sort: Combined similarity & evidence score
      const scoreA = a.similarity * 0.7 + (a.evidenceSource === 'GRAPH' ? 0.3 : 0.15);
      const scoreB = b.similarity * 0.7 + (b.evidenceSource === 'GRAPH' ? 0.3 : 0.15);

      if (Math.abs(scoreB - scoreA) > 0.05) {
        return scoreB - scoreA;
      }

      // 2. Secondary sort: Chunk index / page order stability
      return (a.pageNumber || 0) - (b.pageNumber || 0);
    });
  }
}

export const graphRankerService = new GraphRankerService();
