import {
  KnowledgeEntityType,
  KnowledgeRelationshipType,
  KnowledgeGraphStatus,
  ConflictStatus,
  GraphJobStatus
} from '@prisma/client';

export {
  KnowledgeEntityType,
  KnowledgeRelationshipType,
  KnowledgeGraphStatus,
  ConflictStatus,
  GraphJobStatus
};

export const CONTROLLED_ENTITY_TYPES: KnowledgeEntityType[] = [
  'PERSON',
  'ORGANIZATION',
  'TECHNOLOGY',
  'PRODUCT',
  'PROJECT',
  'CONCEPT',
  'TOPIC',
  'DOCUMENT',
  'LOCATION',
  'EVENT',
  'DATE',
  'METRIC',
  'API',
  'DATABASE',
  'FRAMEWORK',
  'LIBRARY',
  'TOOL',
  'PROCESS',
  'SKILL',
  'CLAIM',
  'OTHER'
];

export const CONTROLLED_RELATIONSHIP_TYPES: KnowledgeRelationshipType[] = [
  'RELATED_TO',
  'DEPENDS_ON',
  'USES',
  'IMPLEMENTS',
  'PART_OF',
  'CONTAINS',
  'MENTIONS',
  'SUPPORTS',
  'CONTRADICTS',
  'REQUIRES',
  'PRODUCES',
  'CAUSED_BY',
  'DERIVED_FROM',
  'ALTERNATIVE_TO',
  'PRECEDES',
  'FOLLOWS',
  'SIMILAR_TO',
  'BELONGS_TO',
  'LOCATED_IN',
  'CREATED_BY'
];

export interface ExtractedEntityDTO {
  name: string;
  type: KnowledgeEntityType;
  description?: string;
  aliases?: string[];
  confidence: number;
}

export interface ExtractedRelationshipDTO {
  sourceEntityName: string;
  targetEntityName: string;
  relationshipType: KnowledgeRelationshipType;
  description?: string;
  confidence: number;
}

export interface ExtractedClaimDTO {
  subjectEntityName: string;
  predicate: string;
  objectEntityName?: string;
  value?: string;
  confidence: number;
}

export interface ExtractionResultDTO {
  entities: ExtractedEntityDTO[];
  relationships: ExtractedRelationshipDTO[];
  claims: ExtractedClaimDTO[];
}

export interface GraphScope {
  userId: string;
  projectId?: string | null;
  knowledgeBaseId?: string | null;
}

export interface GraphQueryOptions extends GraphScope {
  depth?: number; // 1, 2, or 3
  maxNodes?: number;
  entityTypes?: KnowledgeEntityType[];
  relationshipTypes?: KnowledgeRelationshipType[];
  minConfidence?: number;
  searchQuery?: string;
}

export interface GraphNode {
  id: string;
  canonicalName: string;
  entityType: KnowledgeEntityType;
  description?: string | null;
  aliases: string[];
  confidence: number;
  status: KnowledgeGraphStatus;
  projectId?: string | null;
}

export interface GraphEdge {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType: KnowledgeRelationshipType;
  description?: string | null;
  confidence: number;
  status: KnowledgeGraphStatus;
  fingerprint?: string | null;
}

export interface GraphSubgraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  evidenceCount: number;
  conflictsCount: number;
}

export interface GraphRAGCandidate {
  entityId?: string;
  relationshipId?: string;
  claimId?: string;
  chunkId: string;
  documentId: string;
  pageNumber?: number | null;
  content: string;
  snippet?: string | null;
  similarity: number;
  evidenceSource: 'GRAPH' | 'VECTOR' | 'BM25';
  metadata?: any;
}

export interface ConnectionExplanation {
  sourceEntity: GraphNode;
  targetEntity: GraphNode;
  path: Array<{
    node: GraphNode;
    relationship?: GraphEdge;
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

export interface KnowledgeGapReport {
  entityId?: string;
  entityName?: string;
  gapType: 'POORLY_DOCUMENTED' | 'MISSING_RELATIONSHIP' | 'UNRESOLVED_CONFLICT' | 'STUDY_WEAK_AREA';
  description: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  recommendedAction: 'RESEARCH' | 'STUDY' | 'ROADMAP' | 'COPILOT';
}
