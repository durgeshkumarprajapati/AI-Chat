import {
  IntelligenceInsightType,
  IntelligenceSeverity,
  ConfidenceBand,
  InsightStatus,
  InsightReviewAction
} from '@prisma/client';

// Re-exported so consumers of this feature never need to import `@prisma/client` directly.
export type {
  IntelligenceInsightType,
  IntelligenceSeverity,
  ConfidenceBand,
  InsightStatus,
  InsightReviewAction
};

/**
 * Deliberately a loose string union rather than a strict literal type: `IntelligenceEvidence.sourceType`
 * is a polymorphic string column (no FK), so new source kinds can be added by new detectors without a
 * schema change. These are simply the source types Phase 78A's own detectors emit.
 */
export type IntelligenceEvidenceSourceType =
  | 'DOCUMENT'
  | 'DOCUMENT_VERSION'
  | 'MEETING'
  | 'KNOWLEDGE_CLAIM'
  | 'KNOWLEDGE_CONFLICT'
  | 'KNOWLEDGE_ENTITY';

export interface EvidenceInput {
  sourceType: IntelligenceEvidenceSourceType | string;
  /** Must always be a real, already-looked-up row id. Never fabricate this value. */
  sourceId: string;
  snippet?: string | null;
  sourceTimestamp?: Date | null;
}

export interface CreateInsightInput {
  userId: string;
  projectId?: string | null;
  type: IntelligenceInsightType;
  severity: IntelligenceSeverity;
  title: string;
  description: string;
  confidenceBand: ConfidenceBand;
  confidenceScore?: number | null;
  detectionVersion: string;
  metadata?: Record<string, unknown>;
  evidence: EvidenceInput[];
}

export interface InsightFilters {
  status?: InsightStatus;
  type?: IntelligenceInsightType;
  projectId?: string | null;
}

/** A same-subject-entity claim, normalized down to the fields the detection pipeline needs. */
export interface ClaimLike {
  id: string;
  subjectEntityId: string;
  predicate: string;
  value: string | null;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}

/** One side of a contradiction candidate — either a KnowledgeClaim or a retrieved document chunk. */
export interface CandidateSide {
  sourceType: IntelligenceEvidenceSourceType;
  sourceId: string;
  /** Real, already-sanitizable text content for this side (claim value, or chunk content). */
  text: string;
  /** The real timestamp this side's content was authored/updated, or null if unknown. */
  timestamp: Date | null;
  documentId?: string;
}

export interface ContradictionCandidatePair {
  entityId: string;
  entityName?: string;
  left: CandidateSide;
  right: CandidateSide;
}

export interface SemanticClassification {
  isContradiction: boolean;
  /** LLM-reported confidence, 0-1. Never trusted alone — combined with our own signals before persisting. */
  confidence: number;
  reasoning: string;
}

export interface ContradictionDetectionResult {
  candidatesConsidered: number;
  created: number;
  insightIds: string[];
}

export type FreshnessLevel = 'FRESH' | 'REVIEW_RECOMMENDED' | 'POSSIBLY_STALE' | 'STALE' | 'SUPERSEDED';

export interface FreshnessAssessment {
  documentId: string;
  familyId: string | null;
  level: FreshnessLevel;
  ageDays: number;
  reasons: string[];
  supersededByDocumentId?: string;
}

export interface FreshnessDetectionResult {
  documentsScanned: number;
  created: number;
  insightIds: string[];
}

export interface RunAnalysisResult {
  contradictionsFound: number;
  staleFound: number;
}
