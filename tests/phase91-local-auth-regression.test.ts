import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sessionService } from '@/features/auth/session.service';
import { getAuthUser } from '@/lib/auth';
import { GET as meGET } from '@/app/api/auth/me/route';
import { GET as sessionGET } from '@/app/api/auth/session/route';
import { AUTH_BOOTSTRAP_TIMEOUT_MS } from '@/context/WorkspaceContext';

describe('Phase 91.4 — Production-Grade Authentication Bootstrap & Regression Tests', () => {
  const TEST_USER_ID = '99999999-9999-4000-a000-999999999999';
  const TEST_EMAIL = 'local-auth-test@example.com';
  let validToken: string;

  beforeAll(async () => {
    // Cleanup any prior test data
    await prisma.session.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });

    // Create active test user and session token
    await prisma.user.create({
      data: {
        id: TEST_USER_ID,
        email: TEST_EMAIL,
        name: 'Local Auth Test User'
      }
    });
    validToken = await sessionService.createSession(TEST_USER_ID);
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId: TEST_USER_ID } });
    await prisma.user.deleteMany({ where: { id: TEST_USER_ID } });
  });

  describe('Unauthenticated Request Behavior', () => {
    it('returns authenticated: false for /api/auth/me when no session cookie or header is present', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/me');
      const res = await meGET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.authenticated).toBe(false);
      expect(data.user).toBeNull();
    });

    it('returns HTTP 200 with authenticated: false for /api/auth/session when no session cookie or header is present (no 404)', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/session');
      const res = await sessionGET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.authenticated).toBe(false);
      expect(data.user).toBeNull();
    });

    it('throws AuthenticationError when getAuthUser is called with unauthenticated NextRequest', async () => {
      const req = new NextRequest('http://localhost:3000/api/documents');
      await expect(getAuthUser(req)).rejects.toThrow('User authentication required');
    });
  });

  describe('Authenticated Request Behavior', () => {
    it('resolves authenticated user for /api/auth/me with valid session cookie', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/me', {
        headers: { cookie: `rag_session_token=${validToken}` }
      });
      const res = await meGET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.authenticated).toBe(true);
      expect(data.user).toBeDefined();
      expect(data.user.id).toBe(TEST_USER_ID);
      expect(data.user.email).toBe(TEST_EMAIL);
    });

    it('resolves authenticated user for /api/auth/session with valid session cookie', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/session', {
        headers: { cookie: `rag_session_token=${validToken}` }
      });
      const res = await sessionGET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.authenticated).toBe(true);
      expect(data.user).toBeDefined();
      expect(data.user.id).toBe(TEST_USER_ID);
      expect(data.user.email).toBe(TEST_EMAIL);
    });
  });

  describe('Bootstrap Timeout & Failure Handling', () => {
    it('defines a valid AUTH_BOOTSTRAP_TIMEOUT_MS constant of 5000ms', () => {
      expect(AUTH_BOOTSTRAP_TIMEOUT_MS).toBe(5000);
    });

    it('handles simulated fetch abort signal gracefully', async () => {
      const controller = new AbortController();
      controller.abort();

      const fetchPromise = fetch('http://localhost:3000/api/auth/me', {
        signal: controller.signal
      });

      await expect(fetchPromise).rejects.toThrow();
    });
  });
});
