import { prisma } from '@/lib/prisma';
import { configService } from '@/features/config/config.service';
import { IntelligenceSeverity } from '@prisma/client';
import { insightRepository } from './insight.repository';
import { evaluateConfidence } from './confidence.util';
import { EvidenceInput, FreshnessAssessment, FreshnessDetectionResult, FreshnessLevel } from './knowledge-intelligence.types';

const DETECTION_VERSION = 'freshness-v1';

/** Age thresholds (days since last activity), documented here rather than tuned from data. */
const REVIEW_AGE_DAYS = 45;
const POSSIBLY_STALE_AGE_DAYS = 90;
const STALE_AGE_DAYS = 180;

export interface FreshnessComputationInput {
  documentId: string;
  familyId: string | null;
  lastActivityAt: Date;
  now: Date;
  /** A REAL, already-looked-up id of the family's current active document, only if it differs from this one. */
  supersededByDocumentId: string | null;
}

/**
 * Pure, rule-based freshness classifier — no LLM call, no I/O. Exported standalone so it can be
 * unit tested directly against fixtures without mocking Prisma.
 */
export function computeFreshnessLevel(input: FreshnessComputationInput): FreshnessAssessment {
  const ageDays = Math.max(0, Math.floor((input.now.getTime() - input.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24)));
  const reasons: string[] = [];

  if (input.supersededByDocumentId) {
    reasons.push(`A newer active document (id ${input.supersededByDocumentId}) exists in the same document family.`);
    return {
      documentId: input.documentId,
      familyId: input.familyId,
      level: 'SUPERSEDED',
      ageDays,
      reasons,
      supersededByDocumentId: input.supersededByDocumentId
    };
  }

  let level: FreshnessLevel = 'FRESH';
  if (ageDays > STALE_AGE_DAYS) {
    level = 'STALE';
    reasons.push(`No document activity in ${ageDays} days (exceeds the ${STALE_AGE_DAYS}-day stale threshold).`);
  } else if (ageDays > POSSIBLY_STALE_AGE_DAYS) {
    level = 'POSSIBLY_STALE';
    reasons.push(`No document activity in ${ageDays} days (exceeds the ${POSSIBLY_STALE_AGE_DAYS}-day possibly-stale threshold).`);
  } else if (ageDays > REVIEW_AGE_DAYS) {
    level = 'REVIEW_RECOMMENDED';
    reasons.push(`No document activity in ${ageDays} days (exceeds the ${REVIEW_AGE_DAYS}-day review threshold).`);
  }

  return { documentId: input.documentId, familyId: input.familyId, level, ageDays, reasons };
}

function scoreForLevel(level: FreshnessLevel): number {
  switch (level) {
    case 'SUPERSEDED':
      return 0.9;
    case 'STALE':
      return 0.8;
    case 'POSSIBLY_STALE':
      return 0.6;
    case 'REVIEW_RECOMMENDED':
      return 0.45;
    default:
      return 0;
  }
}

function severityForLevel(level: FreshnessLevel): IntelligenceSeverity {
  switch (level) {
    case 'SUPERSEDED':
      return 'CRITICAL';
    case 'STALE':
      return 'HIGH';
    case 'POSSIBLY_STALE':
      return 'MEDIUM';
    default:
      return 'LOW'; // REVIEW_RECOMMENDED
  }
}

/**
 * Rule-based (no LLM required) document freshness/staleness scanner. Only ever reads
 * Document/DocumentVersion/DocumentFamily/DocumentLifecycleEvent rows and creates
 * `IntelligenceInsight` rows describing what it found — it never archives, deletes, or otherwise
 * mutates a Document or any lifecycle field.
 */
export class FreshnessDetectionService {
  public async detectStaleDocuments(userId: string, projectId?: string | null): Promise<FreshnessDetectionResult> {
    const [enabled, freshnessEnabled] = await Promise.all([
      configService.getBoolean('INTELLIGENCE_ENABLED', true),
      configService.getBoolean('INTELLIGENCE_FRESHNESS_DETECTION_ENABLED', true)
    ]);
    if (!enabled || !freshnessEnabled) {
      return { documentsScanned: 0, created: 0, insightIds: [] };
    }

    const maxCandidates = await configService.getNumber('INTELLIGENCE_MAX_CANDIDATES', 50);

    const documents = await prisma.document.findMany({
      where: {
        userId,
        isDeleted: false,
        isArchived: false,
        ...(projectId ? { projects: { some: { projectId } } } : {})
      },
      take: Math.max(1, maxCandidates),
      orderBy: { updatedAt: 'asc' }
    });

    const insightIds: string[] = [];
    let created = 0;
    const now = new Date();

    for (const doc of documents) {
      try {
        const lastEvent = await prisma.documentLifecycleEvent.findFirst({
          where: { documentId: doc.id },
          orderBy: { createdAt: 'desc' }
        });
        const lastActivityAt = lastEvent && lastEvent.createdAt > doc.updatedAt ? lastEvent.createdAt : doc.updatedAt;

        let supersededByDocumentId: string | null = null;
        if (doc.familyId) {
          const family = await prisma.documentFamily.findUnique({ where: { id: doc.familyId } });
          if (family?.activeDocumentId && family.activeDocumentId !== doc.id) {
            // Re-verify the "active" document is a real, non-deleted row before citing it.
            const activeDoc = await prisma.document.findFirst({ where: { id: family.activeDocumentId, isDeleted: false } });
            if (activeDoc) supersededByDocumentId = activeDoc.id;
          }
        }

        const assessment = computeFreshnessLevel({
          documentId: doc.id,
          familyId: doc.familyId ?? null,
          lastActivityAt,
          now,
          supersededByDocumentId
        });

        if (assessment.level === 'FRESH') continue;

        const existing = await insightRepository.findByMetadataKey(userId, 'STALE_KNOWLEDGE', 'documentId', doc.id);
        // Avoid re-creating a duplicate insight when the freshness level hasn't changed since last run.
        if (existing && (existing.metadata as Record<string, unknown> | null)?.freshnessLevel === assessment.level) continue;

        const evaluation = evaluateConfidence(scoreForLevel(assessment.level), assessment.reasons);

        const evidence: EvidenceInput[] = [
          { sourceType: 'DOCUMENT', sourceId: doc.id, snippet: doc.filename, sourceTimestamp: lastActivityAt }
        ];
        if (assessment.supersededByDocumentId) {
          evidence.push({
            sourceType: 'DOCUMENT',
            sourceId: assessment.supersededByDocumentId,
            snippet: 'Newer active document in the same document family.',
            sourceTimestamp: now
          });
        }

        const insight = await insightRepository.createInsight({
          userId,
          projectId: projectId ?? null,
          type: 'STALE_KNOWLEDGE',
          severity: severityForLevel(assessment.level),
          title: `Knowledge freshness: "${doc.filename}" is ${assessment.level.replace(/_/g, ' ').toLowerCase()}`,
          description: assessment.reasons.join(' ') || 'Document freshness review recommended.',
          confidenceBand: evaluation.band,
          confidenceScore: evaluation.score,
          detectionVersion: DETECTION_VERSION,
          metadata: {
            documentId: doc.id,
            freshnessLevel: assessment.level,
            ageDays: assessment.ageDays,
            supersededByDocumentId: assessment.supersededByDocumentId ?? null
          },
          evidence
        });

        insightIds.push(insight.id);
        created++;
      } catch (err) {
        console.error(`[FreshnessDetectionService] failed to assess document ${doc.id}, continuing:`, err);
      }
    }

    return { documentsScanned: documents.length, created, insightIds };
  }
}

export const freshnessDetectionService = new FreshnessDetectionService();
