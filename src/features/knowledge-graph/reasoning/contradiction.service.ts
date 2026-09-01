import { prisma } from '@/lib/prisma';
import { KnowledgeConflict, ConflictStatus } from '@prisma/client';
import { publishAutomationEvent } from '@/features/automation/domain-events/automation-domain-event.publisher';

export class ContradictionService {
  public async detectClaimContradictions(
    userId: string,
    projectId?: string | null
  ): Promise<KnowledgeConflict[]> {
    const claims = await prisma.knowledgeClaim.findMany({
      where: {
        userId,
        projectId: projectId ?? undefined,
        status: 'ACTIVE'
      },
      take: 200
    });

    const conflicts: KnowledgeConflict[] = [];

    for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        const c1 = claims[i];
        const c2 = claims[j];
        if (!c1 || !c2) continue;

        if (c1.subjectEntityId === c2.subjectEntityId && c1.predicate === c2.predicate) {
          if (c1.value && c2.value && c1.value.toLowerCase().trim() !== c2.value.toLowerCase().trim()) {
            // Check if conflict record exists
            const existing = await prisma.knowledgeConflict.findFirst({
              where: {
                userId,
                claimAId: c1.id,
                claimBId: c2.id
              }
            });

            if (!existing) {
              const created = await prisma.knowledgeConflict.create({
                data: {
                  userId,
                  projectId: projectId ?? null,
                  claimAId: c1.id,
                  claimBId: c2.id,
                  conflictType: 'CONTRADICTORY_VALUE',
                  confidence: Math.min(c1.confidence, c2.confidence),
                  status: 'UNRESOLVED'
                }
              });
              conflicts.push(created);
            }
          }
        }
      }
    }

    // Phase 88 — fire-and-forget automation trigger, one per conflict actually created this run
    // (already naturally bounded by the `claims.take(200)` cap above; never awaited-and-blocking,
    // never allowed to affect this method's own return value).
    for (const conflict of conflicts) {
      void publishAutomationEvent({
        eventType: 'KNOWLEDGE_CONTRADICTION_DETECTED',
        sourceUserId: userId,
        sourceProjectId: projectId ?? null,
        sourceEntityId: conflict.id,
        occurredAt: new Date().toISOString(),
        payload: { conflictType: conflict.conflictType, confidence: conflict.confidence }
      });
    }

    return conflicts;
  }

  public async resolveConflict(
    conflictId: string,
    resolution: ConflictStatus,
    resolutionNote?: string
  ): Promise<KnowledgeConflict> {
    return prisma.knowledgeConflict.update({
      where: { id: conflictId },
      data: {
        status: resolution,
        resolution: resolutionNote || null,
        updatedAt: new Date()
      }
    });
  }
}

export const contradictionService = new ContradictionService();
