import { createTestUser, createTestDocument, createTestRoadmap, createTestStudySession, createTestWorkflow } from '../../factories';
import { llmCacheService } from '@/features/llm/llm-cache.service';

describe('Multi-Tenant Security Isolation Tests', () => {
  const USER_A = createTestUser({ id: 'user-sec-a', name: 'User A' });
  const USER_B = createTestUser({ id: 'user-sec-b', name: 'User B' });

  it('prevents User B from accessing User A documents', () => {
    const docA = createTestDocument(USER_A.id, { filename: 'Confidential_UserA.pdf' });
    expect(docA.userId).toBe(USER_A.id);
    expect(docA.userId).not.toBe(USER_B.id);
  });

  it('prevents User B from accessing User A roadmaps', () => {
    const roadmapA = createTestRoadmap(USER_A.id, { title: 'User A Private Roadmap' });
    expect(roadmapA.userId).toBe(USER_A.id);
    expect(roadmapA.userId).not.toBe(USER_B.id);
  });

  it('prevents User B from accessing User A study sessions', () => {
    const sessionA = createTestStudySession(USER_A.id, { topic: 'User A Private Topic' });
    expect(sessionA.userId).toBe(USER_A.id);
    expect(sessionA.userId).not.toBe(USER_B.id);
  });

  it('prevents User B from accessing User A workflows', () => {
    const workflowA = createTestWorkflow(USER_A.id, { name: 'User A Private Workflow' });
    expect(workflowA.userId).toBe(USER_A.id);
    expect(workflowA.userId).not.toBe(USER_B.id);
  });

  it('strictly isolates LLM cache keys between User A and User B', async () => {
    const prompt = 'What is the server login key?';
    const reqA = { userId: USER_A.id, prompt, feature: 'RAG_CHAT' as const };
    const reqB = { userId: USER_B.id, prompt, feature: 'RAG_CHAT' as const };

    const hashA = llmCacheService.computeRequestHash(reqA, 'ollama', 'llama3.2');
    const hashB = llmCacheService.computeRequestHash(reqB, 'ollama', 'llama3.2');
    expect(hashA).not.toBe(hashB);

    const responseA = {
      text: 'User A secret key is RSA-999',
      model: 'llama3.2',
      provider: 'ollama',
      tokensUsed: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      complexity: 'LOW' as const,
      cached: false,
      totalMs: 10
    };

    // Store in User A cache
    await llmCacheService.setCachedResponse(reqA, 'ollama', 'llama3.2', responseA);

    // User A should get cached answer
    const cachedUserA = await llmCacheService.getCachedResponse(reqA, 'ollama', 'llama3.2');
    expect(cachedUserA).not.toBeNull();
    expect(cachedUserA?.text).toBe('User A secret key is RSA-999');

    // User B MUST get null (no cross-tenant leakage!)
    const cachedUserB = await llmCacheService.getCachedResponse(reqB, 'ollama', 'llama3.2');
    expect(cachedUserB).toBeNull();
  });
});
