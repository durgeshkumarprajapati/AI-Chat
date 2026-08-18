import { LLMRequest, RoutingDecision } from './llm.types';
import { LLMProvider } from './llm-provider.interface';
import { llmComplexityClassifier, LLMComplexityClassifier } from './llm-complexity-classifier';
import { llmPolicyService, LLMPolicyService } from './llm-policy.service';
import { llmModelRegistry, LLMModelRegistry } from './llm-model-registry';

export class LLMRouterService {
  private classifier: LLMComplexityClassifier;
  private policy: LLMPolicyService;
  private registry: LLMModelRegistry;

  constructor(classifier?: LLMComplexityClassifier, policy?: LLMPolicyService, registry?: LLMModelRegistry) {
    this.classifier = classifier || llmComplexityClassifier;
    this.policy = policy || llmPolicyService;
    this.registry = registry || llmModelRegistry;
  }

  public resolveRoute(request: LLMRequest): { provider: LLMProvider; decision: RoutingDecision } {
    const complexity = this.classifier.classify(request);
    const decision = this.policy.selectRoute(request, complexity);

    let provider = this.registry.getProvider(decision.providerName);
    if (!provider) {
      // Fallback to Ollama if selected provider not found
      provider = this.registry.getProvider('ollama')!;
      decision.providerName = 'ollama';
      decision.isFallback = true;
      decision.reason = 'Target provider unavailable; fallback to Ollama';
    }

    return { provider, decision };
  }
}

export const llmRouterService = new LLMRouterService();
