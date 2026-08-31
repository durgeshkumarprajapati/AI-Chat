/**
 * Phase 84 — AI Knowledge Graph Explorer.
 *
 * Shared types/constants for the Explorer page and its supporting components. Mirrors the
 * backend contracts verbatim (see the Phase 84 spec) — this file is additive and owned entirely
 * by the Explorer feature; nothing outside `src/app/knowledge-graph/explorer/**` imports it.
 */

import type { BadgeVariant } from '@/components/ui/Badge';

export type ExplorerScope = 'PRIVATE' | 'PROJECT' | 'KNOWLEDGE_BASE';

export interface ExplorerFilters {
  entityTypes?: string[];
  relationshipTypes?: string[];
  minConfidence?: number;
}

export type ConfidenceBand = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ExplorerNodeDTO {
  id: string;
  type: 'ENTITY';
  canonicalName: string;
  entityType: string;
  description: string | null;
  confidence: number;
  confidenceBand: ConfidenceBand;
  status: string;
  updatedAt: string;
}

export interface ExplorerEdgeDTO {
  id: string;
  source: string;
  target: string;
  relationshipType: string;
  description: string | null;
  confidence: number;
}

export interface GraphExplorerResponseDTO {
  nodes: ExplorerNodeDTO[];
  edges: ExplorerEdgeDTO[];
  query: string;
  scope: ExplorerScope;
  depth: number;
  truncated: boolean;
  truncationReason?: 'MAX_NODES' | 'MAX_EDGES' | 'TIMEOUT';
  totalNodes: number;
  totalEdges: number;
  requestId: string;
}

export interface ExplorerEvidenceItemDTO {
  sourceType: 'DOCUMENT';
  documentId: string;
  documentName: string;
  chunkId: string;
  pageNumber: number | null;
  snippet: string | null;
  confidence: number;
}

export interface ExplorerNodeDetailDTO extends ExplorerNodeDTO {
  aliases: string[];
  evidenceAvailable: boolean;
  evidence: ExplorerEvidenceItemDTO[];
  relationships: Array<{
    edge: ExplorerEdgeDTO;
    neighborNodeId: string;
    neighborName: string;
    direction: 'OUTGOING' | 'INCOMING';
  }>;
  relatedDocumentCount: number;
}

export interface AskAboutNodeResult {
  answer: string;
  groundedNodeIds: string[];
  evidenceUsed: number;
}

/** Minimal shape of `ConnectionExplanation` (see knowledge-reasoning.service.ts) — only the
 * fields this UI renders are typed here; the full type lives in a feature module out of scope
 * for this page. */
export interface ConnectionExplanationDTO {
  sourceEntity?: { id?: string; canonicalName?: string; name?: string } | null;
  targetEntity?: { id?: string; canonicalName?: string; name?: string } | null;
  path?: Array<{
    node?: { id?: string; canonicalName?: string; name?: string };
    relationship?: { relationshipType?: string };
  }>;
  summary: string;
  supportingCitations: Array<{
    documentId: string;
    chunkId: string;
    pageNumber?: number | null;
    snippet?: string | null;
  }>;
  confidence: number;
}

/** The 21 fixed KnowledgeEntityType enum values — safe to hardcode as checkbox labels. */
export const ENTITY_TYPES = [
  'PERSON', 'ORGANIZATION', 'TECHNOLOGY', 'PRODUCT', 'PROJECT', 'CONCEPT', 'TOPIC', 'DOCUMENT',
  'LOCATION', 'EVENT', 'DATE', 'METRIC', 'API', 'DATABASE', 'FRAMEWORK', 'LIBRARY', 'TOOL',
  'PROCESS', 'SKILL', 'CLAIM', 'OTHER'
] as const;

/** The 20 fixed KnowledgeRelationshipType enum values — used as a fallback label list. */
export const RELATIONSHIP_TYPES = [
  'RELATED_TO', 'DEPENDS_ON', 'USES', 'IMPLEMENTS', 'PART_OF', 'CONTAINS', 'MENTIONS', 'SUPPORTS',
  'CONTRADICTS', 'REQUIRES', 'PRODUCES', 'CAUSED_BY', 'DERIVED_FROM', 'ALTERNATIVE_TO', 'PRECEDES',
  'FOLLOWS', 'SIMILAR_TO', 'BELONGS_TO', 'LOCATED_IN', 'CREATED_BY'
] as const;

/**
 * Entity-type -> Badge semantic family mapping. Only the 5 semantic families in
 * BADGE_VARIANTS (success/warning/destructive/info/neutral) are used, grouped as:
 *  - info: people & organizations (who/what entity)
 *  - warning: technical building blocks (technology/api/database/framework/library/tool)
 *  - success: documents (the one real evidentiary source in this data model)
 *  - destructive: claims (assertions worth flagging for scrutiny)
 *  - neutral: everything else (project/concept/topic/product/location/event/date/metric/
 *    process/skill/other)
 */
export const ENTITY_TYPE_BADGE_VARIANT: Record<string, BadgeVariant> = {
  PERSON: 'info',
  ORGANIZATION: 'info',
  TECHNOLOGY: 'warning',
  PRODUCT: 'neutral',
  PROJECT: 'neutral',
  CONCEPT: 'neutral',
  TOPIC: 'neutral',
  DOCUMENT: 'success',
  LOCATION: 'neutral',
  EVENT: 'neutral',
  DATE: 'neutral',
  METRIC: 'neutral',
  API: 'warning',
  DATABASE: 'warning',
  FRAMEWORK: 'warning',
  LIBRARY: 'warning',
  TOOL: 'warning',
  PROCESS: 'neutral',
  SKILL: 'neutral',
  CLAIM: 'destructive',
  OTHER: 'neutral'
};

export const CONFIDENCE_BAND_BADGE_VARIANT: Record<ConfidenceBand, BadgeVariant> = {
  HIGH: 'success',
  MEDIUM: 'warning',
  LOW: 'destructive'
};

export const STATUS_BADGE_VARIANT: Record<string, BadgeVariant> = {
  ACTIVE: 'success',
  REVIEW_REQUIRED: 'warning',
  INACTIVE: 'neutral',
  MERGED: 'info',
  ARCHIVED: 'neutral'
};

/** Coarse, non-fake-precision confidence display — never render the raw 0-1 float. */
export function formatConfidencePercent(confidence: number): string {
  return `~${Math.round(confidence * 100)}%`;
}

export interface ProjectOption {
  id: string;
  name: string;
}

export interface KnowledgeBaseOption {
  id: string;
  name: string;
}
