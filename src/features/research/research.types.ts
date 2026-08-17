import {
  ResearchSessionStatus,
  ResearchMode,
  ResearchSourceMode,
  ResearchTaskType,
  ResearchTaskStatus,
  ResearchConfidence,
  ResearchConflictType,
  ResearchConflictStatus,
  ResearchEventType
} from '@prisma/client';

export {
  ResearchSessionStatus,
  ResearchMode,
  ResearchSourceMode,
  ResearchTaskType,
  ResearchTaskStatus,
  ResearchConfidence,
  ResearchConflictType,
  ResearchConflictStatus,
  ResearchEventType
};

export interface CreateResearchSessionInput {
  title?: string;
  question: string;
  researchMode?: ResearchMode;
  sourceMode?: ResearchSourceMode;
  knowledgeBaseId?: string;
  roadmapId?: string;
  documentIds?: string[];
  externalWebEnabled?: boolean;
}

export interface ResearchPlanTask {
  objective: string;
  type: ResearchTaskType;
  priority: number;
  query?: string;
  evidenceRequired?: boolean;
}

export interface ResearchPlan {
  objective: string;
  tasks: ResearchPlanTask[];
}

export interface ResearchToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  permission?: string;
  timeoutMs?: number;
}

export interface CollectedEvidenceItem {
  id: string;
  sourceId: string;
  documentId?: string;
  chunkId?: string;
  visualId?: string;
  contentHash: string;
  evidenceText: string;
  claimText?: string;
  pageNumber?: number;
  confidence: ResearchConfidence;
  title: string;
  url?: string;
  domain?: string;
  qualityScore: number;
}

export interface ExtractedClaimItem {
  id: string;
  claimText: string;
  normalizedClaim: string;
  confidence: ResearchConfidence;
  status: string;
}

export interface DetectedConflictItem {
  id: string;
  claimAId: string;
  claimBId: string;
  conflictType: ResearchConflictType;
  severity: string;
  resolutionStatus: ResearchConflictStatus;
  resolutionSummary?: string;
}

export interface ResearchTelemetry {
  researchSessionId: string;
  status: ResearchSessionStatus;
  currentTask?: string;
  stepsUsed: number;
  searchCount: number;
  sourceCount: number;
  evidenceCount: number;
  claimCount: number;
  conflictCount: number;
  llmCalls: number;
  cacheHit: boolean;
  planningLatency: number;
  searchLatency: number;
  retrievalLatency: number;
  rerankerLatency: number;
  claimLatency: number;
  conflictLatency: number;
  synthesisLatency: number;
  totalLatency: number;
}
