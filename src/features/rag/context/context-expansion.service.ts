import { prisma } from '@/lib/prisma';
import { HybridCandidate } from '../rag.types';
import { RAGConfigService } from '../rag.config';

export class ContextExpansionService {
  /**
   * Optionally retrieves neighboring chunks (chunkIndex - 1, chunkIndex + 1) within document boundaries.
   */
  public async expandNeighbors(
    userId: string,
    candidates: HybridCandidate[]
  ): Promise<HybridCandidate[]> {
    if (!RAGConfigService.isContextExpansionEnabled() || !candidates || candidates.length === 0) {
      return candidates;
    }

    const expanded = await Promise.all(
      candidates.map(async (candidate) => {
        if (!candidate.documentId || candidate.id.startsWith('graph-')) {
          return candidate;
        }

        try {
          const neighborBefore = await prisma.documentChunk.findFirst({
            where: {
              documentId: candidate.documentId,
              chunkIndex: candidate.chunkIndex - 1,
              document: { userId }
            },
            select: { content: true }
          });

          const neighborAfter = await prisma.documentChunk.findFirst({
            where: {
              documentId: candidate.documentId,
              chunkIndex: candidate.chunkIndex + 1,
              document: { userId }
            },
            select: { content: true }
          });

          return {
            ...candidate,
            neighborBeforeContent: neighborBefore?.content,
            neighborAfterContent: neighborAfter?.content
          };
        } catch {
          return candidate;
        }
      })
    );

    return expanded;
  }
}

export const contextExpansionService = new ContextExpansionService();
