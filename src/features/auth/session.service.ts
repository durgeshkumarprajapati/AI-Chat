import { prisma } from '@/lib/prisma';
import { env } from '@/config/env';
import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { UserRole } from '@prisma/client';

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
  role: UserRole;
  avatarUrl?: string | null;
}

export class SessionService {
  public readonly COOKIE_NAME = 'rag_session_token';

  /**
   * Creates a new authenticated session in PostgreSQL and returns the session token.
   */
  public async createSession(userId: string): Promise<string> {
    const sessionToken = randomBytes(32).toString('hex');
    const expiryDays = env.server?.SESSION_EXPIRY_DAYS ?? 7;
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: {
        userId,
        sessionToken,
        expiresAt
      }
    });

    return sessionToken;
  }

  /**
   * Sets the HttpOnly session cookie on the response.
   */
  public setSessionCookie(sessionToken: string): void {
    const expiryDays = env.server?.SESSION_EXPIRY_DAYS ?? 7;
    try {
      const cookieStore = cookies();
      cookieStore.set(this.COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: expiryDays * 24 * 60 * 60
      });
    } catch {
      // Ignore if called outside Server Action / Route Handler context
    }
  }

  /**
   * Validates a session token and returns the authenticated user if valid and unexpired.
   */
  public async validateSession(sessionToken: string): Promise<SessionUser | null> {
    if (!sessionToken || !sessionToken.trim()) return null;

    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { user: true }
    });

    if (!session) return null;

    if (session.expiresAt < new Date()) {
      // Session expired — clean up asynchronously
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      avatarUrl: session.user.avatarUrl
    };
  }

  /**
   * Invalidate and delete an active session.
   */
  public async invalidateSession(sessionToken: string): Promise<void> {
    if (!sessionToken) return;
    await prisma.session.deleteMany({ where: { sessionToken } }).catch(() => {});
  }

  /**
   * Invalidate all active sessions for a given user.
   */
  public async invalidateAllUserSessions(userId: string): Promise<void> {
    await prisma.session.deleteMany({ where: { userId } }).catch(() => {});
  }
}

export const sessionService = new SessionService();
