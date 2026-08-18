/* eslint-disable no-unused-vars */
import {
  LLMRequest,
  LLMResponse,
  LLMStreamChunk,
  StructuredLLMRequest,
  ProviderHealthStatus,
  LLMCapability
} from './llm.types';

export interface LLMProvider {
  readonly name: string;

  generate(request: LLMRequest): Promise<LLMResponse>;

  stream(request: LLMRequest): AsyncIterable<LLMStreamChunk>;

  generateStructured<T>(request: StructuredLLMRequest<T>): Promise<T>;

  healthCheck(): Promise<ProviderHealthStatus>;

  supports(capability: LLMCapability): boolean;
}
