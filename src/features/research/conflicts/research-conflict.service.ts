import { getLLMProvider } from '@/features/rag/llm/llm.provider.factory';
import { LLMProvider } from '@/features/rag/llm/llm.provider';
import { researchRepository } from '../repository/research.repository';
import { ResearchConflictStatus, ResearchConflictType } from '../research.types';
import { prisma } from '@/lib/prisma';

export class ResearchConflictService {
  private llmProvider: LLMProvider;

  constructor(llmProvider?: LLMProvider) {
    this.llmProvider = llmProvider || getLLMProvider();
  }

  public async detectConflicts(sessionId: string): Promise<number> {
    const claims = await prisma.researchClaim.findMany({
      where: { sessionId },
      take: 30
    });

    if (claims.length < 2) return 0;

    const claimsPayload = claims.map((c) => ({ id: c.id, text: c.claimText }));
    const prompt = `Compare these extracted research claims and identify explicit factual contradictions or disagreements (e.g. numeric disagreement, date disagreement, definition contradiction):

Claims:
${JSON.stringify(claimsPayload, null, 2)}

Instructions:
1. Identify any pair of claims that directly contradict each other.
2. Output ONLY a valid JSON array of objects with fields:
   - "claimAId": string
   - "claimBId": string
   - "conflictType": "CONTRADICTION" | "NUMERIC_DISAGREEMENT" | "DATE_DISAGREEMENT" | "DEFINITION_DISAGREEMENT" | "SCOPE_DISAGREEMENT"
   - "severity": "HIGH" | "MEDIUM" | "LOW"
   - "resolutionSummary": string (Explanation of the discrepancy)
3. Do not include markdown code block formatting outside the JSON array.`;

    try {
      const response = await this.llmProvider.generateAnswer({
        question: prompt,
        context: 'You are a JSON-only factual conflict detection system.'
      });

      const cleaned = response.trim().replace(/^```json/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleaned);

      if (Array.isArray(parsed)) {
        let count = 0;
        for (const item of parsed) {
          if (!item.claimAId || !item.claimBId || item.claimAId === item.claimBId) continue;
          let conflictType = (item.conflictType || 'CONTRADICTION').toUpperCase() as ResearchConflictType;
          if (!Object.values(ResearchConflictType).includes(conflictType)) {
            conflictType = ResearchConflictType.CONTRADICTION;
          }

          await researchRepository.saveConflict({
            sessionId,
            claimAId: String(item.claimAId),
            claimBId: String(item.claimBId),
            conflictType,
            severity: String(item.severity || 'MEDIUM'),
            resolutionStatus: ResearchConflictStatus.DISCLOSED,
            resolutionSummary: String(item.resolutionSummary || 'Discrepancy detected between sources.')
          });
          count++;
        }
        await researchRepository.incrementSessionCounts(sessionId, { conflictCount: count });
        return count;
      }
    } catch (err) {
      console.warn('LLM conflict detection failed:', err);
    }

    return 0;
  }
}

export const researchConflictService = new ResearchConflictService();
