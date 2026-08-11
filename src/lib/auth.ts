import { NextRequest } from 'next/server';
import { prisma } from './prisma';
import { AuthenticationError } from '@/errors';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string;
}

export const DEFAULT_DEV_USER: AuthenticatedUser = {
  id: '00000000-0000-4000-a000-000000000001',
  email: 'dev-user@example.com',
  name: 'Development User'
};

/**
 * Server-side authentication helper.
 * Never trusts userId provided directly in body payload by client.
 * Inspects Authorization / X-User-Id headers, falling back to a deterministic development user.
 * Automatically ensures the User record exists in PostgreSQL to preserve FK constraints.
 */
export async function getAuthUser(req?: NextRequest): Promise<AuthenticatedUser> {
  let userId = DEFAULT_DEV_USER.id;
  let email = DEFAULT_DEV_USER.email;

  if (req) {
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

  // Ensure user exists in Prisma DB to satisfy Document.userId foreign key constraint
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email,
      name: `User ${userId.slice(0, 8)}`
    }
  });

  return { id: userId, email };
}
