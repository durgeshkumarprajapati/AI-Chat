/* eslint-disable no-unused-vars */
export enum LLMCapability {
  TEXT_GENERATION = 'TEXT_GENERATION',
  STREAMING = 'STREAMING',
  STRUCTURED_OUTPUT = 'STRUCTURED_OUTPUT',
  TOOL_CALLING = 'TOOL_CALLING',
  LONG_CONTEXT = 'LONG_CONTEXT',
  MULTIMODAL = 'MULTIMODAL',
  REASONING = 'REASONING'
}

export type ComplexityLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type FeatureScope =
  | 'RAG_CHAT'
  | 'STUDY'
  | 'CITY_EXPLORER'
  | 'ROADMAP'
  | 'AGENTIC_RESEARCH'
  | 'WORKFLOW_GENERATION'
  | 'COPILOT'
  | 'MULTIMODAL'
  | 'GENERAL'
  | 'INTELLIGENCE'
  | 'AGENT';

export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  context?: string;
  feature?: FeatureScope;
  userId?: string;
  conversationId?: string;
  modelOverride?: string;
  providerOverride?: string;
  temperature?: number;
  maxTokens?: number;
  capabilitiesRequired?: LLMCapability[];
  signal?: AbortSignal;
  timeoutMs?: number;
  skipCache?: boolean;
  localOnly?: boolean;
  tools?: any[];
  responseFormat?: { type: string };
  /**
   * Phase 69C — optional multimodal image input (base64-encoded). Only the Gemini provider
   * implements real handling of this field (calls Gemini's multimodal API); every other provider
   * throws a clear "does not support multimodal image input" error rather than silently answering
   * text-only. Absent (the default) is a complete no-op for every existing text-only call site.
   */
  images?: Array<{ mimeType: string; data: string }>;
}

export interface LLMResponse {
  text: string;
  provider: string;
  model: string;
  complexity: ComplexityLevel;
  cached: boolean;
  firstTokenMs?: number;
  totalMs: number;
  promptTokens?: number;
  completionTokens?: number;
  toolCalls?: any[];
  finishReason?: string;
}

export interface LLMStreamChunk {
  text: string;
  isFirstToken?: boolean;
  done?: boolean;
  provider?: string;
  model?: string;
}

export interface StructuredLLMRequest<T = any> extends LLMRequest {
  schemaDescription?: string;
  exampleJson?: string;
  parseResult?: (rawText: string) => T;
}

export interface ProviderHealthStatus {
  name: string;
  provider?: string;
  status: 'healthy' | 'unhealthy' | 'disabled';
  configured?: boolean;
  enabled?: boolean;
  available?: boolean;
  model?: string;
  latencyMs?: number;
  message?: string;
}

export interface RoutingDecision {
  providerName: string;
  modelName: string;
  complexity: ComplexityLevel;
  reason: string;
  isFallback?: boolean;
}
