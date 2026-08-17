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
  | 'GENERAL';

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
  status: 'healthy' | 'unhealthy' | 'disabled';
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
