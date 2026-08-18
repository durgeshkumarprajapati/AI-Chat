import { createTestUser } from '../factories';
import { LLMPolicyService } from '@/features/llm/llm-policy.service';

describe('Gemini Multi-Tenant & LOCAL_ONLY Security Isolation Tests', () => {
  const userA = createTestUser({ id: 'user-sec-a' });
  const policy = new LLMPolicyService();

  it('enforces LOCAL_ONLY constraint for private user document requests', () => {
    const route = policy.selectRoute(
      {
        prompt: 'Private confidential evidence chunk',
        userId: userA.id,
        localOnly: true
      },
      'HIGH'
    );

    expect(route.providerName).toBe('ollama');
    expect(route.reason).toContain('LOCAL_ONLY');
  });
});
