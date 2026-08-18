import { retrievalService } from '@/features/rag/retrieval/retrieval.service';
import { graphRetrievalService } from './graph-retrieval.service';
import { graphRankerService } from './graph-ranker.service';
import { GraphQueryOptions, GraphRAGCandidate } from '../knowledge-graph.types';
import { prisma } from '@/lib/prisma';

export class GraphRAGService {
  public async retrieveGroundedContext(
    query: string,
    options: GraphQueryOptions
  ): Promise<{
    candidates: GraphRAGCandidate[];
    graphNodesCount: number;
    graphEdgesCount: number;
  }> {
    // 1. Vector + BM25 Hybrid Retrieval
    const standardChunks = await retrievalService.retrieveContext(options.userId, query, {
      topK: 5
    });

    // 2. Parallel Graph Retrieval
    const graphQuery = options.searchQuery || query;
    const subgraph = await graphRetrievalService.retrieveSubgraph({
      ...options,
      searchQuery: graphQuery,
      maxNodes: 20
    });

    // 3. Fetch evidence chunks supporting graph entities & relationships
    const entityIds = subgraph.nodes.map((n) => n.id);
    const relationshipIds = subgraph.edges.map((e) => e.id);

    const graphEvidences = await prisma.knowledgeEvidence.findMany({
      where: {
        OR: [
          { entityId: { in: entityIds } },
          { relationshipId: { in: relationshipIds } }
        ]
      },
      include: { chunk: true },
      take: 10
    });

    const graphCandidates: GraphRAGCandidate[] = graphEvidences.map((ev) => ({
      entityId: ev.entityId ?? undefined,
      relationshipId: ev.relationshipId ?? undefined,
      claimId: ev.claimId ?? undefined,
      chunkId: ev.chunkId,
      documentId: ev.documentId,
      pageNumber: ev.pageNumber,
      content: ev.chunk.content,
      snippet: ev.snippet,
      similarity: ev.confidence,
      evidenceSource: 'GRAPH'
    }));

    const standardCandidates: GraphRAGCandidate[] = (standardChunks || []).map((c: any) => ({
      chunkId: c.id,
      documentId: c.documentId,
      pageNumber: c.pageNumber,
      content: c.content,
      similarity: c.similarity || 0.8,
      evidenceSource: 'VECTOR'
    }));

    // 4. Fusion & Deduplication
    const candidateMap = new Map<string, GraphRAGCandidate>();
    for (const cand of [...standardCandidates, ...graphCandidates]) {
      if (!candidateMap.has(cand.chunkId)) {
        candidateMap.set(cand.chunkId, cand);
      }
    }

    const merged = Array.from(candidateMap.values());

    // 5. Rank merged candidates
    const ranked = graphRankerService.rankCandidates(merged);

    return {
      candidates: ranked,
      graphNodesCount: subgraph.nodes.length,
      graphEdgesCount: subgraph.edges.length
    };
  }
}

export const graphRAGService = new GraphRAGService();
