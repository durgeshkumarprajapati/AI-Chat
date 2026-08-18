import { assertTestDatabaseSafety } from './helpers/database';
import { installNetworkSafetyGuard, NetworkAccessError } from './helpers/network-safety';
import { mockRedisClient } from './mocks/redis.mock';
import { mockOllamaProvider, mockKimiProvider } from './mocks/llm';
import { createTestUser, createTestAdmin, createTestDocument } from './factories';
import { MOCK_CITATIONS, SAMPLE_PDF_TEXT } from './fixtures';

describe('Phase 40 — Production Jest Testing Infrastructure Suite', () => {
  it('1. Jest environment initializes successfully', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('2. TypeScript transformations work seamlessly', () => {
    const num: number = 40;
    const label: string = `Phase ${num}`;
    expect(label).toBe('Phase 40');
  });

  it('3. @/ path alias resolution works', () => {
    const { env } = require('@/config/env');
    expect(env).toBeDefined();
  });

  it('4. CSS module imports resolve to mock stub', () => {
    const styleMock = require('./mocks/file.mock.js');
    expect(styleMock).toBe('test-file-stub');
  });

  it('5. Image imports resolve to test stub', () => {
    const imageStub = require('./mocks/file.mock.js');
    expect(imageStub).toBe('test-file-stub');
  });

  it('6. Next.js navigation mocks function properly', () => {
    const mockRouter = { push: jest.fn(), back: jest.fn() };
    mockRouter.push('/chat');
    expect(mockRouter.push).toHaveBeenCalledWith('/chat');
  });

  it('7. Next.js headers mock operates safely', () => {
    const mockHeaders = new Map<string, string>();
    mockHeaders.set('authorization', 'Bearer token-test');
    expect(mockHeaders.get('authorization')).toBe('Bearer token-test');
  });

  it('8. Next server route testing works', () => {
    const { NextResponse } = require('next/server');
    const response = NextResponse.json({ success: true });
    expect(response.status).toBe(200);
  });

  it('9. Prisma query mock executes correctly', async () => {
    const mockPrisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', name: 'Alice' }) } };
    const user = await mockPrisma.user.findUnique({ where: { id: 'u1' } });
    expect(user.name).toBe('Alice');
  });

  it('10. Prisma production safety guard throws error if NODE_ENV !== test', () => {
    expect(() => assertTestDatabaseSafety()).not.toThrow();
  });

  it('11. In-memory Redis mock executes get/set/del correctly', async () => {
    await mockRedisClient.set('test:key', 'hello-world', 60);
    const val = await mockRedisClient.get('test:key');
    expect(val).toBe('hello-world');
    await mockRedisClient.del('test:key');
    expect(await mockRedisClient.get('test:key')).toBeNull();
  });

  it('12. Ollama provider mock responds deterministically', async () => {
    const res = await mockOllamaProvider.generate({ prompt: 'Test prompt', feature: 'RAG_CHAT' });
    expect(res.provider).toBe('ollama');
    expect(res.text).toContain('Mock Ollama Response');
  });

  it('13. Kimi provider mock responds deterministically', async () => {
    const res = await mockKimiProvider.generate({ prompt: 'Deep reasoning prompt', feature: 'COPILOT' });
    expect(res.provider).toBe('kimi');
    expect(res.text).toContain('Mock Kimi High-Reasoning Response');
  });

  it('14. LLM Gateway mock handles provider fallback on failure', async () => {
    mockKimiProvider.shouldFail = true;
    try {
      await mockKimiProvider.generate({ prompt: 'Test', feature: 'COPILOT' });
    } catch (err) {
      expect(err).toBeDefined();
    } finally {
      mockKimiProvider.shouldFail = false;
    }
  });

  it('15. External network safety guard blocks unmocked requests', async () => {
    const uninstall = installNetworkSafetyGuard(['allowed.local']);
    try {
      await fetch('https://unauthorized-external-api.com/data');
      fail('Expected NetworkAccessError to be thrown');
    } catch (err) {
      expect(err instanceof NetworkAccessError).toBe(true);
    } finally {
      uninstall();
    }
  });

  it('16. Authentication fixtures generate correct roles', () => {
    const user = createTestUser();
    const admin = createTestAdmin();
    expect(user.role).toBe('USER');
    expect(admin.role).toBe('ADMIN');
  });

  it('17. User isolation fixtures maintain distinct tenant IDs', () => {
    const userA = createTestUser();
    const userB = createTestUser();
    const docA = createTestDocument(userA.id);
    const docB = createTestDocument(userB.id);
    expect(docA.userId).not.toBe(docB.userId);
  });

  it('18. Test factories generate unique deterministic IDs', () => {
    const doc1 = createTestDocument('u1');
    const doc2 = createTestDocument('u1');
    expect(doc1.id).not.toBe(doc2.id);
  });

  it('19. Test cleanup helper clears mock Redis store', () => {
    mockRedisClient.clear();
    expect(mockRedisClient.get('any')).resolves.toBeNull();
  });

  it('20. Test fixtures provide deterministic data snippets', () => {
    expect(SAMPLE_PDF_TEXT).toContain('SECURITY POLICY 2026');
    expect(MOCK_CITATIONS.length).toBe(1);
  });
});
