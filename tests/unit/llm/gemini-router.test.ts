import { LLMRouterService } from '@/features/llm/llm-router.service';
import { LLMPolicyService } from '@/features/llm/llm-policy.service';

describe('Gemini LLM Router & Policy Unit Tests', () => {
  const policy = new LLMPolicyService();
  const router = new LLMRouterService(undefined, policy);

  it('routes LOCAL_ONLY requests exclusively to Ollama', () => {
    const { decision } = router.resolveRoute({
      prompt: 'Private document prompt',
      localOnly: true
    });

    expect(decision.providerName).toBe('ollama');
    expect(decision.reason).toContain('LOCAL_ONLY');
  });

  it('routes explicit Gemini provider overrides to Gemini', () => {
    const { decision } = router.resolveRoute({
      prompt: 'Explicit provider request',
      providerOverride: 'gemini'
    });

    expect(decision.providerName).toBe('gemini');
  });
});
