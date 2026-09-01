export type CopilotSessionStatus =
  | 'IDLE'
  | 'ANALYZING'
  | 'PLANNING'
  | 'WAITING_FOR_CONFIRMATION'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type CopilotIntent =
  | 'QUESTION'
  | 'DOCUMENT_ANALYSIS'
  | 'WEB_RESEARCH'
  | 'LEARNING'
  | 'ROADMAP'
  | 'WORKFLOW'
  | 'PROJECT'
  | 'MULTI_STEP'
  | 'CLARIFICATION_REQUIRED';

export type CopilotGoalCategory =
  | 'LEARNING'
  | 'RESEARCH'
  | 'PROJECT'
  | 'CAREER'
  | 'DOCUMENT_ANALYSIS'
  | 'AUTOMATION'
  | 'OTHER';

export type CopilotGoalStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'PAUSED' | 'CANCELLED';
export type CopilotGoalPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type CopilotMemoryCategory =
  | 'USER_PREFERENCE'
  | 'LEARNING_PREFERENCE'
  | 'PROJECT_CONTEXT'
  | 'GOAL'
  | 'TECHNICAL_CONTEXT'
  | 'WORKFLOW_PREFERENCE'
  // Phase 90 — additive categories, see prisma schema CopilotMemoryCategory enum.
  | 'USER_PROFILE'
  | 'TECHNICAL_DECISION'
  | 'IMPORTANT_FACT'
  | 'CONVERSATION_MEMORY'
  | 'WORKING_PATTERN';

export type CopilotCapability =
  | 'DOCUMENT_RAG'
  | 'KNOWLEDGE_BASE_SEARCH'
  | 'WEB_SEARCH'
  | 'AGENTIC_RESEARCH'
  | 'MULTIMODAL_ANALYSIS'
  | 'ROADMAP'
  | 'STUDY'
  | 'WORKFLOW'
  | 'CHAT'
  | 'PROJECT_CONTEXT'
  | 'MEMORY';

export type CopilotActionStatus = 'PROPOSED' | 'APPROVED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type CopilotEventType =
  | 'SESSION_CREATED'
  | 'INTENT_DETECTED'
  | 'PLAN_CREATED'
  | 'PLAN_VALIDATED'
  | 'CONFIRMATION_REQUIRED'
  | 'ACTION_STARTED'
  | 'ACTION_COMPLETED'
  | 'ACTION_FAILED'
  | 'EVIDENCE_COLLECTED'
  | 'RESEARCH_STARTED'
  | 'RESEARCH_COMPLETED'
  | 'ROADMAP_CREATED'
  | 'STUDY_CREATED'
  | 'WORKFLOW_STARTED'
  | 'WORKFLOW_COMPLETED'
  | 'FINAL_RESPONSE_READY'
  | 'SESSION_FAILED'
  | 'SESSION_CANCELLED';

export interface CopilotPlanStep {
  id: string;
  capability: CopilotCapability;
  purpose: string;
  input: Record<string, any>;
  requiresConfirmation?: boolean;
}

export interface CopilotPlan {
  goal: string;
  intent: CopilotIntent;
  steps: CopilotPlanStep[];
  requiresConfirmation: boolean;
}

export interface CopilotEvidenceItem {
  id: string;
  sourceType: 'DOCUMENT' | 'WEB' | 'RESEARCH' | 'MULTIMODAL' | 'ROADMAP' | 'STUDY';
  sourceId: string;
  title: string;
  content: string;
  documentId?: string;
  pageNumber?: number;
  url?: string;
  citationLabel: string;
  score?: number;
  metadata?: Record<string, any>;
}

export interface CopilotExecutionRequest {
  userId: string;
  projectId?: string;
  conversationId?: string;
  query: string;
  documentIds?: string[];
  knowledgeBaseId?: string;
  roadmapId?: string;
  studySessionId?: string;
  sourceMode?: 'documents' | 'web' | 'all' | 'copilot';
  idempotencyKey?: string;
}

export interface CopilotExecutionResult {
  sessionId: string;
  status: CopilotSessionStatus;
  intent: CopilotIntent;
  plan: CopilotPlan;
  actions: {
    id: string;
    capability: CopilotCapability;
    status: CopilotActionStatus;
    requiresConfirmation: boolean;
    output?: any;
    error?: string;
  }[];
  evidences: CopilotEvidenceItem[];
  response: string;
  citations: { label: string; title: string; url?: string; pageNumber?: number }[];
  requiresConfirmation: boolean;
}
