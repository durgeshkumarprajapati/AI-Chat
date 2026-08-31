import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { retrievalService } from '@/features/rag/retrieval/retrieval.service';
import { RetrievedChunk } from '@/features/rag/retrieval/retrieval.types';
import { llmGateway } from '@/features/llm/llm-gateway.service';
import { multimodalContentSanitizer } from '@/features/multimodal-document-intelligence/security/multimodal-content-sanitizer';
import { contradictionService } from '@/features/knowledge-graph/reasoning/contradiction.service';
import { ConfidenceBand, IntelligenceSeverity } from '@prisma/client';
import { insightRepository } from './insight.repository';
import { evaluateConfidence, blendConfidence, clampScore } from './confidence.util';
import {
  ClaimLike,
  CandidateSide,
  ContradictionCandidatePair,
  SemanticClassification,
  ContradictionDetectionResult,
  EvidenceInput
} from './knowledge-intelligence.types';

const DETECTION_VERSION = 'kg-contradiction-v1';
/** Bounded RAG usage per run — never "compare every document with every other document". */
const MAX_ENTITIES_FOR_RAG = 5;
const MAX_CHUNKS_PER_ENTITY = 2;

function parseSemanticClassification(raw: string): SemanticClassification {
  try {
    const parsed = JSON.parse(raw);
    return {
      isContradiction: Boolean(parsed?.isContradiction),
      confidence: clampScore(Number(parsed?.confidence)),
      reasoning: typeof parsed?.reasoning === 'string' ? parsed.reasoning : ''
    };
  } catch {
    return { isContradiction: false, confidence: 0, reasoning: 'Failed to parse model output.' };
  }
}

interface VerifiedEvidence {
  leftEvidence: EvidenceInput;
  rightEvidence: EvidenceInput;
  olderSide: CandidateSide | null;
  newerSide: CandidateSide | null;
}

/**
 * The bounded, multi-stage contradiction-detection pipeline described in the Phase 78A spec:
 *   Stage 0 — fold in the existing narrow syntactic `contradictionService` as one input signal.
 *   Stage 1 — bounded candidate generation (KnowledgeClaim groups + a light RAG signal).
 *   Stage 2 — entity/topic alignment (cheap, in-memory).
 *   Stage 3 — temporal comparison using each side's real timestamp.
 *   Stage 4 — AI semantic classification (LLM judgement only — never dictates IDs/citations).
 *   Stage 5 — evidence validation (only persist if every referenced ID is a real, verified row).
 */
export class ContradictionDetectionService {
  public async detectContradictions(userId: string, projectId?: string | null): Promise<ContradictionDetectionResult> {
    const [enabled, contradictionEnabled] = await Promise.all([
      configService.getBoolean('INTELLIGENCE_ENABLED', true),
      configService.getBoolean('INTELLIGENCE_CONTRADICTION_DETECTION_ENABLED', true)
    ]);
    if (!enabled || !contradictionEnabled) {
      return { candidatesConsidered: 0, created: 0, insightIds: [] };
    }

    const [maxCandidates, timeoutMs, minConfidence] = await Promise.all([
      configService.getNumber('INTELLIGENCE_MAX_CANDIDATES', 50),
      configService.getNumber('INTELLIGENCE_ANALYSIS_TIMEOUT_MS', 30000),
      configService.getNumber('INTELLIGENCE_MIN_CONFIDENCE', 0.4)
    ]);

    const deadline = Date.now() + Math.max(1000, timeoutMs);
    const insightIds: string[] = [];
    let created = 0;

    created += await this.ingestSyntacticConflicts(userId, projectId, insightIds, deadline);

    const pairs = await this.generateCandidatePairs(userId, projectId, Math.max(1, maxCandidates));
    let candidatesConsidered = 0;

    for (const pair of pairs) {
      candidatesConsidered++;
      // Soft timeout — stop starting new candidate work, but return what we already have.
      if (Date.now() > deadline) break;
      try {
        const insightId = await this.classifyAndPersist(userId, projectId, pair, minConfidence, timeoutMs, deadline);
        if (insightId) {
          created++;
          insightIds.push(insightId);
        }
      } catch (err) {
        console.error('[ContradictionDetectionService] candidate failed, continuing:', err);
      }
    }

    return { candidatesConsidered, created, insightIds };
  }

  /** Stage 0: converts the existing syntactic detector's output into IntelligenceInsight rows. */
  private async ingestSyntacticConflicts(
    userId: string,
    projectId: string | null | undefined,
    insightIds: string[],
    deadline: number
  ): Promise<number> {
    let created = 0;
    let conflicts;
    try {
      conflicts = await contradictionService.detectClaimContradictions(userId, projectId ?? null);
    } catch (err) {
      console.error('[ContradictionDetectionService] syntactic detection failed, continuing with broader pass only:', err);
      return 0;
    }

    for (const conflict of conflicts) {
      if (Date.now() > deadline) break;
      try {
        const already = await insightRepository.findByMetadataKey(userId, 'CONTRADICTION', 'sourceConflictId', conflict.id);
        if (already) continue;

        const [claimA, claimB] = await Promise.all([
          prisma.knowledgeClaim.findUnique({ where: { id: conflict.claimAId } }),
          prisma.knowledgeClaim.findUnique({ where: { id: conflict.claimBId } })
        ]);
        // Never persist evidence for a claim that no longer exists.
        if (!claimA || !claimB) continue;

        const [older, newer] = claimA.createdAt <= claimB.createdAt ? [claimA, claimB] : [claimB, claimA];
        const evaluation = evaluateConfidence(conflict.confidence, [
          'Exact-match same-subject/predicate, differing-value conflict detected by the syntactic knowledge-graph contradiction detector.'
        ]);

        const evidence: EvidenceInput[] = [
          { sourceType: 'KNOWLEDGE_CLAIM', sourceId: claimA.id, snippet: (claimA.value ?? '').slice(0, 500), sourceTimestamp: claimA.createdAt },
          { sourceType: 'KNOWLEDGE_CLAIM', sourceId: claimB.id, snippet: (claimB.value ?? '').slice(0, 500), sourceTimestamp: claimB.createdAt },
          { sourceType: 'KNOWLEDGE_CONFLICT', sourceId: conflict.id, snippet: conflict.conflictType, sourceTimestamp: conflict.createdAt }
        ];

        const insight = await insightRepository.createInsight({
          userId,
          projectId: projectId ?? null,
          type: 'CONTRADICTION',
          severity: this.severityForBand(evaluation.band),
          title: 'Conflicting claims about the same subject and predicate',
          description:
            `Two active knowledge claims assert different values for the same subject/predicate ("${claimA.predicate}"). ` +
            `Older claim (${older.createdAt.toISOString()}): "${older.value}". Newer claim (${newer.createdAt.toISOString()}): "${newer.value}".`,
          confidenceBand: evaluation.band,
          confidenceScore: evaluation.score,
          detectionVersion: DETECTION_VERSION,
          metadata: {
            sourceConflictId: conflict.id,
            pipeline: 'syntactic-claim-conflict',
            temporal: {
              olderClaimId: older.id,
              olderTimestamp: older.createdAt.toISOString(),
              newerClaimId: newer.id,
              newerTimestamp: newer.createdAt.toISOString()
            }
          },
          evidence
        });

        insightIds.push(insight.id);
        created++;
      } catch (err) {
        console.error('[ContradictionDetectionService] failed to convert a syntactic conflict, continuing:', err);
      }
    }

    return created;
  }

  /** Stage 1 + Stage 2: bounded candidate generation, pre-aligned by shared subjectEntityId. */
  private async generateCandidatePairs(
    userId: string,
    projectId: string | null | undefined,
    maxCandidates: number
  ): Promise<ContradictionCandidatePair[]> {
    const claims = await prisma.knowledgeClaim.findMany({
      where: { userId, projectId: projectId ?? undefined, status: 'ACTIVE' },
      take: maxCandidates,
      orderBy: { createdAt: 'desc' }
    });
    if (claims.length === 0) return [];

    const byEntity = new Map<string, ClaimLike[]>();
    for (const c of claims) {
      const list = byEntity.get(c.subjectEntityId) ?? [];
      list.push(c);
      byEntity.set(c.subjectEntityId, list);
    }

    // Never call retrieval for every entity — only a handful per run.
    const entityIds = Array.from(byEntity.keys()).slice(0, MAX_ENTITIES_FOR_RAG);
    const entities = entityIds.length
      ? await prisma.knowledgeEntity.findMany({ where: { id: { in: entityIds }, userId } })
      : [];

    const pairs: ContradictionCandidatePair[] = [];
    let budget = maxCandidates;

    for (const entity of entities) {
      if (budget <= 0) break;
      const claimsForEntity = byEntity.get(entity.id) ?? [];
      if (claimsForEntity.length === 0) continue;

      let chunks: RetrievedChunk[] = [];
      try {
        const result = await retrievalService.retrieveContextWithTrace(userId, entity.canonicalName, {
          topK: MAX_CHUNKS_PER_ENTITY,
          sourceMode: 'documents_only'
        });
        chunks = result.chunks;
      } catch (err) {
        console.error(`[ContradictionDetectionService] RAG lookup failed for entity ${entity.id}, skipping:`, err);
        continue;
      }

      for (const claim of claimsForEntity) {
        if (budget <= 0) break;
        if (!claim.value) continue;
        for (const chunk of chunks) {
          if (budget <= 0) break;
          pairs.push({
            entityId: entity.id,
            entityName: entity.canonicalName,
            left: {
              sourceType: 'KNOWLEDGE_CLAIM',
              sourceId: claim.id,
              text: `${claim.predicate}: ${claim.value}`,
              timestamp: claim.createdAt
            },
            right: {
              sourceType: 'DOCUMENT',
              sourceId: chunk.documentId,
              text: chunk.content,
              timestamp: chunk.documentCreatedAt ? new Date(chunk.documentCreatedAt) : null,
              documentId: chunk.documentId
            }
          });
          budget--;
        }
      }
    }

    return pairs;
  }

  /** Stage 3 (temporal) + Stage 4 (AI classification) + Stage 5 (evidence validation/persist). */
  private async classifyAndPersist(
    userId: string,
    projectId: string | null | undefined,
    pair: ContradictionCandidatePair,
    minConfidence: number,
    timeoutMs: number,
    deadline: number
  ): Promise<string | null> {
    const sanitizedLeft = multimodalContentSanitizer.sanitize(pair.left.text, pair.left.sourceType, pair.left.sourceId);
    const sanitizedRight = multimodalContentSanitizer.sanitize(pair.right.text, pair.right.sourceType, pair.right.sourceId);

    const remainingMs = Math.max(1000, deadline - Date.now());
    const perCallTimeoutMs = Math.min(timeoutMs, remainingMs);

    const classification = await llmGateway.generateStructured<SemanticClassification>({
      feature: 'INTELLIGENCE',
      userId,
      timeoutMs: perCallTimeoutMs,
      temperature: 0,
      systemPrompt:
        'You are a careful fact-checking assistant. You are given two pieces of evidence about the same entity/topic from a ' +
        "user's own knowledge base. Decide whether they factually contradict each other (assert different, incompatible facts " +
        'about the same thing), as opposed to being unrelated, complementary, or differently worded but consistent. Respond only ' +
        'with the requested JSON.',
      prompt:
        `Entity: ${pair.entityName ?? pair.entityId}\n\nEvidence A:\n${sanitizedLeft}\n\nEvidence B:\n${sanitizedRight}\n\n` +
        'Do these two pieces of evidence contradict each other?',
      schemaDescription: '{ "isContradiction": boolean, "confidence": number (0-1), "reasoning": string (max 2 sentences) }',
      exampleJson:
        '{"isContradiction": true, "confidence": 0.8, "reasoning": "Evidence A states the deadline is March 1 while Evidence B states it is April 15."}',
      parseResult: (raw: string) => parseSemanticClassification(raw)
    });

    if (!classification || !classification.isContradiction) return null;

    // The LLM's judgement/reasoning inform the score; the final evidence IDs never come from it.
    const heuristicScore = 0.6; // both sides already passed entity alignment
    const blended = blendConfidence(heuristicScore, 0.4, clampScore(classification.confidence), 0.6);
    const evaluation = evaluateConfidence(blended, [
      'Same-entity alignment confirmed in-memory.',
      'AI semantic classification judged the two sources as contradictory.'
    ]);

    if (evaluation.score < minConfidence) return null;

    const verified = await this.verifyEvidence(pair);
    if (!verified) return null;

    const pairKey = this.pairKey(pair);
    const already = await insightRepository.findByMetadataKey(userId, 'CONTRADICTION', 'pairKey', pairKey);
    if (already) return null;

    const insight = await insightRepository.createInsight({
      userId,
      projectId: projectId ?? null,
      type: 'CONTRADICTION',
      severity: this.severityForBand(evaluation.band),
      title: `Possible contradiction detected for "${pair.entityName ?? pair.entityId}"`,
      description: this.buildDescription(pair, classification, verified.olderSide, verified.newerSide),
      confidenceBand: evaluation.band,
      confidenceScore: evaluation.score,
      detectionVersion: DETECTION_VERSION,
      metadata: {
        pairKey,
        pipeline: 'broad-semantic',
        entityId: pair.entityId,
        entityName: pair.entityName ?? null,
        reasoning: (classification.reasoning ?? '').slice(0, 500),
        temporal:
          verified.olderSide && verified.newerSide
            ? {
                olderSourceType: verified.olderSide.sourceType,
                olderSourceId: verified.olderSide.sourceId,
                olderTimestamp: verified.olderSide.timestamp?.toISOString() ?? null,
                newerSourceType: verified.newerSide.sourceType,
                newerSourceId: verified.newerSide.sourceId,
                newerTimestamp: verified.newerSide.timestamp?.toISOString() ?? null
              }
            : null
      },
      evidence: [verified.leftEvidence, verified.rightEvidence]
    });

    return insight.id;
  }

  /**
   * Stage 5: re-verifies both sides of a candidate pair against real rows immediately before
   * persisting. Never persists an insight if a referenced ID cannot be confirmed to still exist.
   */
  private async verifyEvidence(pair: ContradictionCandidatePair): Promise<VerifiedEvidence | null> {
    const claimSide = pair.left.sourceType === 'KNOWLEDGE_CLAIM' ? pair.left : pair.right.sourceType === 'KNOWLEDGE_CLAIM' ? pair.right : null;
    const docSide = pair.left.sourceType === 'DOCUMENT' ? pair.left : pair.right.sourceType === 'DOCUMENT' ? pair.right : null;
    if (!claimSide || !docSide) return null;

    const [claim, document] = await Promise.all([
      prisma.knowledgeClaim.findUnique({ where: { id: claimSide.sourceId } }),
      prisma.document.findFirst({ where: { id: docSide.documentId ?? docSide.sourceId, isDeleted: false } })
    ]);
    if (!claim || !document) return null;

    const resolvedClaimSide: CandidateSide = { ...claimSide, sourceId: claim.id, timestamp: claim.createdAt };
    const resolvedDocSide: CandidateSide = { ...docSide, sourceId: document.id, timestamp: document.updatedAt ?? document.createdAt };

    let olderSide: CandidateSide | null = null;
    let newerSide: CandidateSide | null = null;
    if (resolvedClaimSide.timestamp && resolvedDocSide.timestamp) {
      [olderSide, newerSide] =
        resolvedClaimSide.timestamp <= resolvedDocSide.timestamp
          ? [resolvedClaimSide, resolvedDocSide]
          : [resolvedDocSide, resolvedClaimSide];
    }

    const sideToEvidence = (side: CandidateSide): EvidenceInput =>
      side.sourceType === 'KNOWLEDGE_CLAIM'
        ? { sourceType: 'KNOWLEDGE_CLAIM', sourceId: claim.id, snippet: (claim.value ?? '').slice(0, 500), sourceTimestamp: claim.createdAt }
        : {
            sourceType: 'DOCUMENT',
            sourceId: document.id,
            snippet: (side.text ?? '').slice(0, 500),
            sourceTimestamp: resolvedDocSide.timestamp
          };

    return {
      leftEvidence: sideToEvidence(pair.left),
      rightEvidence: sideToEvidence(pair.right),
      olderSide,
      newerSide
    };
  }

  private pairKey(pair: ContradictionCandidatePair): string {
    return [`${pair.left.sourceType}:${pair.left.sourceId}`, `${pair.right.sourceType}:${pair.right.sourceId}`].sort().join('|');
  }

  private buildDescription(
    pair: ContradictionCandidatePair,
    classification: SemanticClassification,
    olderSide: CandidateSide | null,
    newerSide: CandidateSide | null
  ): string {
    const reasoning = (classification.reasoning ?? '').slice(0, 500);
    const temporalNote =
      olderSide && newerSide
        ? ` The ${newerSide.sourceType === 'DOCUMENT' ? 'document' : 'claim'} dated ${newerSide.timestamp?.toISOString()} appears more recent than the ${olderSide.sourceType === 'DOCUMENT' ? 'document' : 'claim'} dated ${olderSide.timestamp?.toISOString()}.`
        : '';
    return `AI semantic analysis flagged a likely contradiction for "${pair.entityName ?? pair.entityId}". ${reasoning}${temporalNote}`;
  }

  private severityForBand(band: ConfidenceBand): IntelligenceSeverity {
    if (band === 'HIGH') return 'HIGH';
    if (band === 'MEDIUM') return 'MEDIUM';
    return 'LOW';
  }
}

export const contradictionDetectionService = new ContradictionDetectionService();
