import { llmComplexityClassifier } from '@/features/llm/llm-complexity-classifier';
import { llmPolicyService } from '@/features/llm/llm-policy.service';

describe('LLM Gateway Router & Complexity Classifier Unit Tests', () => {
  it('classifies simple queries as LOW complexity', () => {
    const complexity = llmComplexityClassifier.classify({ prompt: 'What is MFA?', feature: 'RAG_CHAT' });
    expect(complexity).toBe('LOW');
  });

  it('classifies long analytical prompts as HIGH complexity', () => {
    const longPrompt = 'Perform a detailed comparative analysis between RSA-4096 and Kyber-1024 post-quantum key encapsulation mechanism. Provide step-by-step mathematical proof of hardness assumptions and evaluate side-channel vulnerabilities under physical fault injection.';
    const complexity = llmComplexityClassifier.classify({ prompt: longPrompt, feature: 'COPILOT' });
    expect(complexity).toBe('HIGH');
  });

  it('classifies agentic research requests as HIGH complexity', () => {
    const complexity = llmComplexityClassifier.classify({ prompt: 'Research quantum mechanics', feature: 'AGENTIC_RESEARCH' });
    expect(complexity).toBe('HIGH');
  });

  it('enforces feature policies for RAG_CHAT and AGENTIC_RESEARCH', () => {
    const ragRoute = llmPolicyService.selectRoute({ prompt: 'Hello', feature: 'RAG_CHAT' }, 'LOW');
    expect(ragRoute.providerName).toBe('ollama');

    const researchRoute = llmPolicyService.selectRoute({ prompt: 'Analyze quantum formulas', feature: 'AGENTIC_RESEARCH' }, 'HIGH');
    expect(researchRoute.providerName).toBeDefined();
  });
});
