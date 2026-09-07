import Home from '../src/app/page';
import { sessionService } from '../src/features/auth/session.service';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

jest.mock('next/headers', () => ({
  cookies: jest.fn()
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn()
}));

describe('Phase 92 — Authenticated Home Page Redirect', () => {
  const mockGetCookie = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (cookies as jest.Mock).mockReturnValue({
      get: mockGetCookie
    });
  });

  test('1. Unauthenticated user: renders LandingPage without redirecting', async () => {
    mockGetCookie.mockReturnValue(undefined);

    const component = await Home();
    expect(redirect).not.toHaveBeenCalled();
    expect(component).toBeDefined();
  });

  test('2. Invalid or expired session: renders LandingPage without redirecting', async () => {
    mockGetCookie.mockReturnValue({ value: 'invalid-session-token' });
    jest.spyOn(sessionService, 'validateSession').mockResolvedValueOnce(null);

    const component = await Home();
    expect(redirect).not.toHaveBeenCalled();
    expect(component).toBeDefined();
  });

  test('3. Authenticated user with valid session: automatically redirects to /dashboard', async () => {
    mockGetCookie.mockReturnValue({ value: 'valid-session-token' });
    jest.spyOn(sessionService, 'validateSession').mockResolvedValueOnce({
      id: 'user-123',
      email: 'user@example.com',
      name: 'Test User',
      role: 'USER',
      authProvider: 'EMAIL',
      status: 'ACTIVE',
      emailVerified: true,
      createdAt: new Date()
    });

    await Home();
    expect(redirect).toHaveBeenCalledWith('/dashboard');
  });
});
