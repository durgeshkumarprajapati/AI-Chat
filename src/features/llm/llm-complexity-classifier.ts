import { LLMRequest, ComplexityLevel } from './llm.types';

export class LLMComplexityClassifier {
  /**
   * Deterministically classifies request complexity without calling an LLM.
   */
  public classify(request: LLMRequest): ComplexityLevel {
    // 1. High Complexity Signals
    if (
      request.feature === 'AGENTIC_RESEARCH' ||
      request.feature === 'WORKFLOW_GENERATION' ||
      (request.tools && request.tools.length > 0)
    ) {
      return 'HIGH';
    }

    const promptLen = (request.prompt || '').length;
    const contextLen = (request.context || '').length;
    const totalChars = promptLen + contextLen;

    if (totalChars > 12000) {
      return 'HIGH';
    }

    const reasoningKeywords = ['compare', 'analyze', 'synthesize', 'conflict', 'roadmap', 'multi-step', 'step-by-step'];
    const lowerPrompt = request.prompt.toLowerCase();
    const hasReasoningKeyword = reasoningKeywords.some((k) => lowerPrompt.includes(k));

    if (hasReasoningKeyword && (totalChars > 3000 || request.feature === 'COPILOT')) {
      return 'HIGH';
    }

    // 2. Medium Complexity Signals
    if (
      totalChars > 1500 ||
      request.feature === 'STUDY' ||
      request.feature === 'ROADMAP' ||
      request.feature === 'COPILOT'
    ) {
      return 'MEDIUM';
    }

    // 3. Low Complexity Fast Path (RAG Chat, City Explorer, Simple QA)
    return 'LOW';
  }
}

export const llmComplexityClassifier = new LLMComplexityClassifier();
