/**
 * Phase 89 — Unified AI Copilot & Global Conversational Workspace Intelligence.
 *
 * Shared wire-contract types for the "AI Assistant" floating widget. These mirror, verbatim,
 * the backend contracts the sibling agent is building against
 * (POST /api/assistant/chat and the /api/assistant/conversations* routes). Do not rename these
 * types — the drawer, the streaming client, and AssistantContext all import from here so the
 * contract stays in exactly one place.
 *
 * NOTE: this is a completely different surface from the pre-existing `/copilot` "plan and
 * execute" feature (`src/app/copilot`, `src/features/copilot`, `src/app/api/copilot/**`) — that
 * feature is untouched by this phase. Everything in `src/components/assistant/**` is the new
 * "AI Assistant" floating chat widget only.
 */

export type AssistantScope = 'GLOBAL' | 'WORKSPACE' | 'PROJECT' | 'DOCUMENT' | 'KNOWLEDGE_BASE';

export type AssistantIntent =
  | 'RAG_QUESTION'
  | 'KNOWLEDGE_GRAPH_QUESTION'
  | 'INTELLIGENCE_QUESTION'
  | 'AGENT_ACTION'
  | 'CLICKUP_ACTION'
  | 'CALENDAR_ACTION'
  | 'AUTOMATION_QUESTION'
  | 'SARVAM_ACTION'
  | 'GENERAL_QUESTION';

export interface AssistantContextHint {
  route?: string;
  module?: string;
  projectId?: string;
  documentId?: string;
  knowledgeBaseId?: string;
  meetingId?: string;
  knowledgeEntityId?: string;
  automationId?: string;
}

export interface AssistantChatRequest {
  conversationId?: string;
  message: string;
  contextHint?: AssistantContextHint;
  scope?: AssistantScope;
}

export type AssistantStreamStage = 'understanding' | 'searching' | 'analyzing' | 'generating';

export interface AssistantEvidenceItem {
  sourceType: string;
  sourceId: string;
  snippet?: string | null;
  title?: string;
}

export type AssistantStreamEvent =
  | { event: 'start'; data: { conversationId: string; messageId: string } }
  | { event: 'stage'; data: { stage: AssistantStreamStage } }
  | { event: 'delta'; data: { text: string } }
  | { event: 'evidence'; data: { items: AssistantEvidenceItem[] } }
  | { event: 'approval_required'; data: { agentRunId: string; stepIndex: number; description: string } }
  | { event: 'done'; data: { messageId: string; usedIntent: AssistantIntent } }
  | { event: 'error'; data: { code: string; message: string } };

export interface AssistantConversationSummaryDTO {
  id: string;
  title: string;
  scope: AssistantScope;
  projectId: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AssistantMessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';

export interface AssistantMessageDTO {
  id: string;
  role: AssistantMessageRole;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export const ASSISTANT_MAX_MESSAGE_LENGTH = 4000;
