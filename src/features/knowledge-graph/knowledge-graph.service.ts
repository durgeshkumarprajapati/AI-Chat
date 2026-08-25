import { knowledgeGraphJobService } from './ingestion/knowledge-graph-job.service';
import { graphRetrievalService } from './retrieval/graph-retrieval.service';
import { contradictionService } from './reasoning/contradiction.service';
import { knowledgeGapService } from './reasoning/knowledge-gap.service';
import { knowledgeReasoningService } from './reasoning/knowledge-reasoning.service';
import { knowledgeGraphCacheService } from './cache/knowledge-graph-cache.service';
import { knowledgeGraphTelemetryService } from './telemetry/knowledge-graph-telemetry.service';
import { GraphQueryOptions, GraphSubgraph } from './knowledge-graph.types';
import { prisma } from '@/lib/prisma';

export class KnowledgeGraphService {
  public async getGraph(options: GraphQueryOptions): Promise<GraphSubgraph> {
    const cacheKey = knowledgeGraphCacheService.buildCacheKey(
      options.userId,
      options.projectId,
      1,
      JSON.stringify(options)
    );

    const cached = await knowledgeGraphCacheService.get<GraphSubgraph>(cacheKey);
    if (cached) {
      knowledgeGraphTelemetryService.logEvent({ event: 'knowledge_graph.cache.hit', userId: options.userId });
      return cached;
    }

    knowledgeGraphTelemetryService.logEvent({ event: 'knowledge_graph.cache.miss', userId: options.userId });
    const result = await graphRetrievalService.retrieveSubgraph(options);

    await knowledgeGraphCacheService.set(cacheKey, result);
    knowledgeGraphTelemetryService.logEvent({ event: 'knowledge_graph.query.completed', userId: options.userId });

    return result;
  }

  public async getEntityDetails(entityId: string, options: GraphQueryOptions) {
    const neighborhood = await graphRetrievalService.getEntityNeighborhood(entityId, options);
    return neighborhood;
  }

  public async indexDocument(documentId: string, userId: string, projectId?: string | null) {
    const job = await knowledgeGraphJobService.queueDocumentGraphJob(userId, documentId, projectId);
    await knowledgeGraphCacheService.clearUserCache(userId);
    return job;
  }

  public async triggerDocumentExtraction(documentId: string, userId: string, projectId?: string | null) {
    const job = await knowledgeGraphJobService.queueDocumentGraphJob(userId, documentId, projectId);
    await knowledgeGraphCacheService.clearUserCache(userId);
    return job;
  }

  public async backfillUserDocuments(userId: string) {
    const res = await knowledgeGraphJobService.backfillUserDocuments(userId);
    await knowledgeGraphCacheService.clearUserCache(userId);
    return res;
  }

  public async getGraphStatus(userId: string) {
    const [entitiesCount, relationshipsCount, completedDocsCount, pendingJobsCount] = await Promise.all([
      prisma.knowledgeEntity.count({ where: { userId, status: 'ACTIVE' } }),
      prisma.knowledgeRelationship.count({ where: { userId, status: 'ACTIVE' } }),
      prisma.document.count({ where: { userId, status: 'COMPLETED' } }),
      prisma.knowledgeGraphJob.count({
        where: { userId, status: { in: ['PENDING', 'PROCESSING'] } }
      })
    ]);

    return {
      entitiesCount,
      relationshipsCount,
      completedDocsCount,
      pendingJobsCount,
      hasGraphData: entitiesCount > 0 || relationshipsCount > 0,
      isExtracting: pendingJobsCount > 0
    };
  }

  public async searchGraph(query: string, options: GraphQueryOptions) {
    return graphRetrievalService.retrieveSubgraph({
      ...options,
      searchQuery: query
    });
  }

  public async explainConnection(userId: string, sourceId: string, targetId: string, projectId?: string | null) {
    return knowledgeReasoningService.explainConnection(userId, sourceId, targetId, projectId);
  }

  public async getConflicts(userId: string, projectId?: string | null) {
    return contradictionService.detectClaimContradictions(userId, projectId);
  }

  public async getGaps(userId: string, projectId?: string | null) {
    return knowledgeGapService.detectKnowledgeGaps(userId, projectId);
  }
}

export const knowledgeGraphService = new KnowledgeGraphService();
