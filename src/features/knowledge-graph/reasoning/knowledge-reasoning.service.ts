import { prisma } from '@/lib/prisma';
import { llmGateway } from '@/features/llm/llm-gateway.service';
import { buildConnectionReasoningPrompt } from '../prompts/reasoning.prompt';
import { ConnectionExplanation, GraphNode } from '../knowledge-graph.types';
import { knowledgeGraphRepository } from '../knowledge-graph.repository';

export class KnowledgeReasoningService {
  public async explainConnection(
    userId: string,
    sourceEntityId: string,
    targetEntityId: string,
    projectId?: string | null
  ): Promise<ConnectionExplanation> {
    const source = await prisma.knowledgeEntity.findFirst({
      where: { id: sourceEntityId, userId }
    });
    const target = await prisma.knowledgeEntity.findFirst({
      where: { id: targetEntityId, userId }
    });

    if (!source || !target) {
      throw new Error('Source or Target entity not found or access denied.');
    }

    const { entities, relationships } = await knowledgeGraphRepository.getEntityNeighborhood(
      sourceEntityId,
      { userId, projectId: projectId ?? undefined, depth: 3 }
    );

    const hasTargetInNeighborhood = entities.some((e) => e.id === targetEntityId);

    if (!hasTargetInNeighborhood) {
      return {
        sourceEntity: {
          id: source.id,
          canonicalName: source.canonicalName,
          entityType: source.entityType,
          aliases: [],
          confidence: source.confidence,
          status: source.status
        },
        targetEntity: {
          id: target.id,
          canonicalName: target.canonicalName,
          entityType: target.entityType,
          aliases: [],
          confidence: target.confidence,
          status: target.status
        },
        path: [],
        summary: 'NO_GROUNDED_CONNECTION_FOUND: No multi-hop path exists between these concepts in authorized documents.',
        supportingCitations: [],
        confidence: 0.0
      };
    }

    // Path construction
    const pathNodes: GraphNode[] = entities.map((e) => ({
      id: e.id,
      canonicalName: e.canonicalName,
      entityType: e.entityType,
      aliases: Array.isArray(e.aliases) ? (e.aliases as string[]) : [],
      confidence: e.confidence,
      status: e.status
    }));

    const pathDesc = relationships
      .map((r) => `${r.sourceEntityId} -> [${r.relationshipType}] -> ${r.targetEntityId}`)
      .join('\n');

    // Supporting citations
    const evidences = await prisma.knowledgeEvidence.findMany({
      where: {
        OR: [
          { entityId: { in: entities.map((e) => e.id) } },
          { relationshipId: { in: relationships.map((r) => r.id) } }
        ]
      },
      take: 5
    });

    const snippets = evidences.map((e) => e.snippet || `Chunk ${e.chunkId}`).filter(Boolean);
    const prompt = buildConnectionReasoningPrompt(
      source.canonicalName,
      target.canonicalName,
      pathDesc,
      snippets
    );

    const llmRes = await llmGateway.generate({
      prompt,
      feature: 'GENERAL',
      userId
    });

    return {
      sourceEntity: pathNodes[0]!,
      targetEntity: (pathNodes[pathNodes.length - 1] || pathNodes[0])!,
      path: pathNodes.map((node) => ({ node })),
      summary: llmRes.text,
      supportingCitations: evidences.map((ev) => ({
        documentId: ev.documentId,
        chunkId: ev.chunkId,
        pageNumber: ev.pageNumber,
        snippet: ev.snippet
      })),
      confidence: 0.95
    };
  }
}

export const knowledgeReasoningService = new KnowledgeReasoningService();
