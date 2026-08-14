import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auditService } from '@/features/auth/audit.service';
import { UserRole } from '@prisma/client';
import { AppError } from '@/errors';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    requireRole(authUser, UserRole.ADMIN);

    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get('q')?.trim() || '';

    const users = await prisma.user.findMany({
      where: query
        ? {
            OR: [
              { email: { contains: query, mode: 'insensitive' } },
              { name: { contains: query, mode: 'insensitive' } }
            ]
          }
        : undefined,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        googleId: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            documents: true,
            conversations: true,
            knowledgeBases: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({
      success: true,
      data: users
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    console.error('GET /api/admin/users error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch users.' } },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    requireRole(authUser, UserRole.ADMIN);

    const body = await req.json().catch(() => ({}));
    const targetUserId = typeof body.userId === 'string' ? body.userId : '';
    const newRole = body.role as UserRole;

    if (!targetUserId || !['ADMIN', 'USER'].includes(newRole)) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'userId and valid role are required.' } },
        { status: 400 }
      );
    }

    // Self-demotion safety check
    if (targetUserId === authUser.id && newRole !== UserRole.ADMIN) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Admin users cannot demote themselves.' } },
        { status: 403 }
      );
    }

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: { role: newRole },
      select: { id: true, email: true, name: true, role: true }
    });

    await auditService.log(authUser.id, 'ROLE_CHANGE', 'USER', targetUserId, { newRole });

    return NextResponse.json({
      success: true,
      data: updatedUser
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    console.error('PATCH /api/admin/users error:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update user role.' } },
      { status: 500 }
    );
  }
}
