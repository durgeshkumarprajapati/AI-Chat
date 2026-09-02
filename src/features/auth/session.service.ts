import { prisma } from '@/lib/prisma';
import { env } from '@/config/env';
import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { UserRole, AuthProvider, UserStatus } from '@prisma/client';

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
  role: UserRole;
  authProvider: AuthProvider;
  status: UserStatus;
  emailVerified: boolean;
  avatarUrl?: string | null;
  createdAt: Date;
  lastLoginAt?: Date | null;
}

export class SessionService {
  public readonly COOKIE_NAME = 'rag_session_token';

  /**
   * Creates a new authenticated session in PostgreSQL and returns the session token.
   */
  public async createSession(
    userId: string,
    metadata?: { ipAddress?: string; userAgent?: string; deviceInfo?: string }
  ): Promise<string> {
    const sessionToken = randomBytes(32).toString('hex');
    const expiryDays = env.server?.SESSION_EXPIRY_DAYS ?? 7;
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: {
        userId,
        sessionToken,
        ipAddress: metadata?.ipAddress || null,
        userAgent: metadata?.userAgent || null,
        deviceInfo: metadata?.deviceInfo || (metadata?.userAgent ? this.parseDeviceInfo(metadata.userAgent) : 'Browser'),
        expiresAt
      }
    });

    // Update lastLoginAt
    await prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() }
    }).catch(() => {});

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
   * Directly attaches the HttpOnly session cookie to an outgoing NextResponse object.
   */
  public attachSessionCookie<T extends NextResponse>(res: T, sessionToken: string): T {
    const expiryDays = env.server?.SESSION_EXPIRY_DAYS ?? 7;
    res.cookies.set(this.COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: expiryDays * 24 * 60 * 60
    });
    return res;
  }

  /**
   * Validates a session token and returns the authenticated user if valid, active, and unexpired.
   */
  public async validateSession(sessionToken: string): Promise<SessionUser | null> {
    if (!sessionToken || !sessionToken.trim()) return null;

    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { user: true }
    });

    if (!session) return null;

    if (session.expiresAt < new Date()) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      return null;
    }

    // Account status check (Disabled / Suspended accounts are immediately rejected)
    if (session.user.status !== UserStatus.ACTIVE) {
      await prisma.session.deleteMany({ where: { userId: session.user.id } }).catch(() => {});
      return null;
    }

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      authProvider: session.user.authProvider,
      status: session.user.status,
      emailVerified: session.user.emailVerified,
      avatarUrl: session.user.avatarUrl,
      createdAt: session.user.createdAt,
      lastLoginAt: session.user.lastLoginAt
    };
  }

  /**
   * Lists active sessions for a user.
   */
  public async listUserSessions(userId: string, currentSessionToken?: string) {
    const sessions = await prisma.session.findMany({
      where: { userId, expiresAt: { gte: new Date() } },
      orderBy: { createdAt: 'desc' }
    });

    return sessions.map((s) => ({
      id: s.id,
      deviceInfo: s.deviceInfo || 'Browser Session',
      ipAddress: s.ipAddress || '127.0.0.1',
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      isCurrent: s.sessionToken === currentSessionToken
    }));
  }

  /**
   * Invalidate and delete an active session by token or ID.
   */
  public async invalidateSession(sessionTokenOrId: string): Promise<void> {
    if (!sessionTokenOrId) return;
    await prisma.session.deleteMany({
      where: {
        OR: [{ sessionToken: sessionTokenOrId }, { id: sessionTokenOrId }]
      }
    }).catch(() => {});
  }

  /**
   * Invalidate all active sessions for a given user.
   */
  public async invalidateAllUserSessions(userId: string): Promise<void> {
    await prisma.session.deleteMany({ where: { userId } }).catch(() => {});
  }

  private parseDeviceInfo(ua: string): string {
    if (ua.includes('Chrome')) return 'Chrome / Desktop';
    if (ua.includes('Firefox')) return 'Firefox / Desktop';
    if (ua.includes('Safari')) return 'Safari / Mac';
    if (ua.includes('Mobile')) return 'Mobile Browser';
    return 'Browser Session';
  }
}

export const sessionService = new SessionService();
