import { entitlementService } from '@/features/billing/entitlement.service';
import { contradictionDetectionService } from './contradiction-detection.service';
import { freshnessDetectionService } from './freshness-detection.service';
import { RunAnalysisResult } from './knowledge-intelligence.types';

/**
 * Single entry point for a full Phase 78A analysis pass for one user (optionally project-scoped).
 * This is what a future worker job or an API route calls — it does not itself run on a schedule.
 *
 * `entitlementService.requireFeature` is a soft, currently-inert gate: while BILLING_ENABLED=false
 * (today's default) it always resolves without effect, but wiring it in now means billing can gate
 * this feature later purely via configuration, with no code changes here.
 */
export class KnowledgeIntelligenceOrchestrator {
  public async runAnalysisForUser(userId: string, projectId?: string): Promise<RunAnalysisResult> {
    await entitlementService.requireFeature(userId, 'KNOWLEDGE_INTELLIGENCE');

    // A failure in one detector must never prevent the other from running.
    const [contradictionResult, freshnessResult] = await Promise.allSettled([
      contradictionDetectionService.detectContradictions(userId, projectId ?? null),
      freshnessDetectionService.detectStaleDocuments(userId, projectId ?? null)
    ]);

    if (contradictionResult.status === 'rejected') {
      console.error('[KnowledgeIntelligenceOrchestrator] contradiction detection failed:', contradictionResult.reason);
    }
    if (freshnessResult.status === 'rejected') {
      console.error('[KnowledgeIntelligenceOrchestrator] freshness detection failed:', freshnessResult.reason);
    }

    return {
      contradictionsFound: contradictionResult.status === 'fulfilled' ? contradictionResult.value.created : 0,
      staleFound: freshnessResult.status === 'fulfilled' ? freshnessResult.value.created : 0
    };
  }
}

export const knowledgeIntelligenceOrchestrator = new KnowledgeIntelligenceOrchestrator();
