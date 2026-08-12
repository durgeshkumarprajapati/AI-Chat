/* eslint-disable no-unused-vars */
export interface LLMGenerateInput {
  question: string;
  context: string;
}

export interface LLMProvider {
  generateAnswer(input: LLMGenerateInput): Promise<string>;
  streamAnswer(input: LLMGenerateInput): AsyncIterable<string>;
}
