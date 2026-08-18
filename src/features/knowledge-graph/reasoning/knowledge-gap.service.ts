import { prisma } from '@/lib/prisma';
import { KnowledgeGapReport } from '../knowledge-graph.types';

export class KnowledgeGapService {
  public async detectKnowledgeGaps(
    userId: string,
    projectId?: string | null
  ): Promise<KnowledgeGapReport[]> {
    const reports: KnowledgeGapReport[] = [];

    // 1. Entities with low evidence count (poorly documented)
    const entities = await prisma.knowledgeEntity.findMany({
      where: {
        userId,
        projectId: projectId ?? undefined,
        status: 'ACTIVE'
      },
      include: {
        evidences: true,
        sourceRelationships: true,
        targetRelationships: true
      },
      take: 100
    });

    for (const ent of entities) {
      if (ent.evidences.length <= 1) {
        reports.push({
          entityId: ent.id,
          entityName: ent.canonicalName,
          gapType: 'POORLY_DOCUMENTED',
          description: `Concept "${ent.canonicalName}" is referenced in graph but has only 1 supporting evidence chunk.`,
          priority: 'MEDIUM',
          recommendedAction: 'RESEARCH'
        });
      }

      // Isolated entity (no relationships)
      if (ent.sourceRelationships.length === 0 && ent.targetRelationships.length === 0) {
        reports.push({
          entityId: ent.id,
          entityName: ent.canonicalName,
          gapType: 'MISSING_RELATIONSHIP',
          description: `Concept "${ent.canonicalName}" is disconnected from other project entities.`,
          priority: 'LOW',
          recommendedAction: 'COPILOT'
        });
      }
    }

    // 2. Unresolved conflicts
    const unresolvedConflicts = await prisma.knowledgeConflict.findMany({
      where: {
        userId,
        projectId: projectId ?? undefined,
        status: 'UNRESOLVED'
      },
      include: {
        claimA: { include: { subjectEntity: true } },
        claimB: { include: { subjectEntity: true } }
      },
      take: 20
    });

    for (const conflict of unresolvedConflicts) {
      reports.push({
        entityId: conflict.claimA.subjectEntityId,
        entityName: conflict.claimA.subjectEntity.canonicalName,
        gapType: 'UNRESOLVED_CONFLICT',
        description: `Conflicting claims detected for "${conflict.claimA.subjectEntity.canonicalName}": ${conflict.conflictType}`,
        priority: 'HIGH',
        recommendedAction: 'RESEARCH'
      });
    }

    return reports;
  }
}

export const knowledgeGapService = new KnowledgeGapService();
