import { llmGateway } from '@/features/llm/llm-gateway.service';
import { buildQueryIntelligencePrompt } from './query-enhancement.prompt';
import { queryEnhancementValidatorService, EnhancementFields } from './query-enhancement-validator.service';
import { QueryIntelligenceResult } from '../query-intelligence.types';

/**
 * Optional, timeout-bounded LLM refinement of the heuristic analysis. NEVER throws — any failure,
 * malformed output, or timeout resolves to `null`, and the caller must simply keep the heuristic
 * result. This is the "optional LLM enhancement" stage of the 69B analysis pipeline.
 */
export class LLMQueryEnhancerService {
  public async enhance(
    question: string,
    heuristicResult: QueryIntelligenceResult,
    userId: string,
    timeoutMs: number
  ): Promise<EnhancementFields | null> {
    try {
      const prompt = buildQueryIntelligencePrompt(question, heuristicResult);
      const response = await llmGateway.generate({
        prompt,
        feature: 'GENERAL',
        userId,
        timeoutMs
      });

      let parsed: any;
      try {
        parsed = JSON.parse(response.text);
      } catch {
        const match = response.text.match(/\{[\s\S]*\}/);
        if (match) {
          parsed = JSON.parse(match[0]);
        }
      }

      const validated = queryEnhancementValidatorService.sanitizeAndValidate(parsed);
      return Object.keys(validated).length > 0 ? validated : null;
    } catch (err) {
      console.warn('[LLMQueryEnhancerService] Enhancement failed (falling back to heuristic only):', err);
      return null;
    }
  }
}

export const llmQueryEnhancerService = new LLMQueryEnhancerService();
