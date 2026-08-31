import { KnowledgeEntityType, KnowledgeRelationshipType, KnowledgeGraphStatus } from '@prisma/client';

/**
 * Phase 84 — AI Knowledge Graph Explorer.
 *
 * This module is an ADDITIVE, read-mostly presentation/query layer over the existing Knowledge
 * Graph backend (src/features/knowledge-graph/**). It never mutates the existing graph and never
 * touches the existing repository/service/routes — see kg-explorer.service.ts for the full
 * behavioral contract.
 *
 * These are the exact contracts the UI (built in parallel, not against this code) integrates
 * against — do not rename fields or change shapes here without coordinating with that side.
 */

export type ExplorerScope = 'PRIVATE' | 'PROJECT' | 'KNOWLEDGE_BASE';

export interface ExplorerFilters {
  entityTypes?: KnowledgeEntityType[];
  relationshipTypes?: KnowledgeRelationshipType[];
  minConfidence?: number;
}

export interface ExplorerQueryRequest {
  query?: string;
  scope: ExplorerScope;
  projectId?: string;
  knowledgeBaseId?: string;
  depth?: number;
  filters?: ExplorerFilters;
}

export type ConfidenceBand = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ExplorerNodeDTO {
  id: string;
  type: 'ENTITY';
  canonicalName: string;
  entityType: KnowledgeEntityType;
  description: string | null;
  confidence: number;
  confidenceBand: ConfidenceBand;
  status: KnowledgeGraphStatus;
  updatedAt: string; // ISO
}

export interface ExplorerEdgeDTO {
  id: string;
  source: string;
  target: string;
  relationshipType: KnowledgeRelationshipType;
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

/**
 * Internal scope-resolution context, produced by KgExplorerService after authorization succeeds
 * and consumed by the repository. Not part of the UI-facing contract.
 */
export interface ResolvedExplorerScope {
  scope: ExplorerScope;
  userId: string;
  projectId?: string | null;
  knowledgeBaseId?: string | null;
}
