import { prisma } from '@/lib/prisma';
import { HybridCandidate } from '../rag.types';

export class ParentChildContextService {
  /**
   * Resolves parent context if parent chunk metadata exists, or returns original chunk content.
   */
  public async resolveParentContext(
    userId: string,
    candidates: HybridCandidate[]
  ): Promise<HybridCandidate[]> {
    if (!candidates || candidates.length === 0) return [];

    const resolved = await Promise.all(
      candidates.map(async (candidate) => {
        const metadata = candidate.metadata as Record<string, unknown>;
        const parentChunkId = metadata?.parentChunkId as string | undefined;

        if (parentChunkId) {
          try {
            const parentChunk = await prisma.documentChunk.findFirst({
              where: {
                id: parentChunkId,
                document: { userId }
              },
              select: { content: true }
            });
            if (parentChunk) {
              return {
                ...candidate,
                parentContent: parentChunk.content
              };
            }
          } catch {
            // Graceful fallback to child chunk if parent lookup fails
          }
        }

        return candidate;
      })
    );

    return resolved;
  }
}

export const parentChildContextService = new ParentChildContextService();
