import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    return NextResponse.json({
      authenticated: true,
      user: {
        id: authUser.id,
        name: authUser.name || authUser.email.split('@')[0],
        email: authUser.email,
        role: authUser.role,
        authProvider: authUser.authProvider,
        emailVerified: authUser.emailVerified,
        avatarUrl: authUser.avatarUrl || null,
        status: authUser.status,
        createdAt: authUser.createdAt,
        lastLoginAt: authUser.lastLoginAt || authUser.createdAt
      }
    });
  } catch {
    return NextResponse.json({
      authenticated: false,
      user: null
    });
  }
}
