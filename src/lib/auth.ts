import { NextRequest } from 'next/server';
import { prisma } from './prisma';
import { AuthenticationError, AuthorizationError } from '@/errors';
import { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string | null;
  role: UserRole;
}

export const DEFAULT_DEV_USER: AuthenticatedUser = {
  id: '00000000-0000-4000-a000-000000000001',
  email: 'dev-user@example.com',
  name: 'Development User',
  role: UserRole.USER
};

/**
 * Server-side authentication helper.
 * Never trusts userId provided directly in body payload by client.
 * Inspects rag_session_token cookie, Authorization / X-User-Id headers, falling back to a deterministic development user.
 * Automatically ensures the User record exists in PostgreSQL to preserve FK constraints.
 */
export async function getAuthUser(req?: NextRequest): Promise<AuthenticatedUser> {
  let userId = DEFAULT_DEV_USER.id;
  let email = DEFAULT_DEV_USER.email;

  if (req) {
    // 1. Check HttpOnly session cookie
    const cookieHeader = req.headers.get('cookie') || '';
    const sessionMatch = cookieHeader.match(/rag_session_token=([^;]+)/);
    const sessionToken = sessionMatch ? sessionMatch[1] : null;

    if (sessionToken) {
      const session = await prisma.session.findUnique({
        where: { sessionToken },
        include: { user: true }
      });
      if (session && session.expiresAt > new Date()) {
        return {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
          role: session.user.role
        };
      }
    }

    // 2. Fallback to X-User-Id or Bearer token (preserves full compatibility with automated test runners)
    const authHeader = req.headers.get('authorization');
    const customUserHeader = req.headers.get('x-user-id');

    if (customUserHeader && customUserHeader.trim()) {
      userId = customUserHeader.trim();
      email = `user-${userId}@example.com`;
    } else if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (token) {
        userId = token;
        email = `user-${token}@example.com`;
      }
    }
  }

  if (!userId) {
    throw new AuthenticationError('User authentication required');
  }

  // Ensure user exists in Prisma DB with proper role
  const user = await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email,
      name: `User ${userId.slice(0, 8)}`,
      role: UserRole.USER
    }
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role
  };
}

/**
 * Ensures user is authenticated.
 */
export async function requireAuthenticatedUser(req?: NextRequest): Promise<AuthenticatedUser> {
  const user = await getAuthUser(req);
  if (!user || !user.id) {
    throw new AuthenticationError('Authentication required');
  }
  return user;
}

/**
 * Server-side RBAC guard requiring explicit UserRole (e.g. ADMIN).
 */
export function requireRole(user: AuthenticatedUser, requiredRole: UserRole): void {
  if (user.role !== requiredRole) {
    throw new AuthorizationError(`Access denied: Requires ${requiredRole} role.`);
  }
}

/**
 * Server-side resource ownership guard.
 */
export function requireResourceOwnership(userId: string, resourceUserId: string): void {
  if (userId !== resourceUserId) {
    throw new AuthorizationError('Access denied: Unauthorized resource access.');
  }
}
