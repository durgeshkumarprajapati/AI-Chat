/**
 * Phase 89 — Unified AI Assistant.
 *
 * NAMING: "Assistant" (never "Copilot") throughout this feature — see
 * prisma/migrations/20260901040000_phase89_ai_assistant/migration.sql for the full naming
 * rationale. This is the exact contract the UI (built in parallel, not against this code)
 * integrates against — do not rename fields or change shapes here without coordinating with that
 * side.
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
// SECURITY: every field above is a CLIENT HINT ONLY. The orchestrator must independently
// re-authorize every id before using it for anything (project membership, document ownership,
// etc.) — never trust this object's contents as proof of access.

export interface AssistantChatRequest {
  conversationId?: string; // omit to create a new conversation
  message: string;
  contextHint?: AssistantContextHint;
  scope?: AssistantScope; // defaults to GLOBAL if omitted
}

export type AssistantStreamEvent =
  | { event: 'start'; data: { conversationId: string; messageId: string } }
  | { event: 'stage'; data: { stage: 'understanding' | 'searching' | 'analyzing' | 'generating' } } // ONLY real stages actually executed — never fabricated
  | { event: 'delta'; data: { text: string } }
  | { event: 'evidence'; data: { items: Array<{ sourceType: string; sourceId: string; snippet?: string | null; title?: string }> } }
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

export interface AssistantMessageDTO {
  id: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/**
 * Internal, orchestrator-only result of independently re-authorizing every non-empty field of a
 * client-supplied AssistantContextHint. Only ids that passed their OWN system's real
 * authorization primitive survive into this object — never a bespoke new check, and never a
 * pass-through of the raw client hint.
 */
export interface AuthorizedAssistantContext {
  projectId?: string;
  documentId?: string;
  knowledgeBaseId?: string;
  meetingId?: string;
  knowledgeEntityId?: string;
  automationId?: string;
}
