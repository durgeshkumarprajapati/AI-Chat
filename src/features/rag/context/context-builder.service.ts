import { HybridCandidate } from '../rag.types';
import { parentChildContextService } from './parent-child-context.service';
import { contextExpansionService } from './context-expansion.service';
import { contextBudgetService } from './context-budget.service';

export class ContextBuilderService {
  /**
   * Formats structured context for LLM prompt generation from ranked hybrid candidates.
   */
  public async buildContext(
    userId: string,
    candidates: HybridCandidate[]
  ): Promise<{ formattedContext: string; selectedCandidates: HybridCandidate[] }> {
    const parentResolved = await parentChildContextService.resolveParentContext(userId, candidates);
    const expanded = await contextExpansionService.expandNeighbors(userId, parentResolved);
    const selectedCandidates = contextBudgetService.fitWithinBudget(expanded);

    const contextBlocks = selectedCandidates.map((candidate, idx) => {
      const sourceHeader = `[Source ${idx + 1}] Document: ${candidate.filename} (ID: ${
        candidate.documentId
      }) | Engines: ${candidate.sources.join(', ')}`;

      const beforeStr = candidate.neighborBeforeContent
        ? `--- Previous Context ---\n${candidate.neighborBeforeContent}\n`
        : '';
      const mainContent = candidate.parentContent
        ? `--- Main Parent Content ---\n${candidate.parentContent}`
        : candidate.content;
      const afterStr = candidate.neighborAfterContent
        ? `\n--- Next Context ---\n${candidate.neighborAfterContent}`
        : '';

      return `${sourceHeader}\n${beforeStr}${mainContent}${afterStr}`;
    });

    const formattedContext = contextBlocks.join('\n\n========================================\n\n');

    return {
      formattedContext,
      selectedCandidates
    };
  }
}

export const contextBuilderService = new ContextBuilderService();
