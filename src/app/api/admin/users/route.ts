import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auditService } from '@/features/auth/audit.service';
import { sessionService } from '@/features/auth/session.service';
import { UserRole, UserStatus } from '@prisma/client';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

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
        authProvider: true,
        status: true,
        emailVerified: true,
        googleId: true,
        avatarUrl: true,
        createdAt: true,
        lastLoginAt: true,
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
    const newRole = body.role as UserRole | undefined;
    const newStatus = body.status as UserStatus | undefined;

    if (!targetUserId) {
      return NextResponse.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'targetUserId is required.' } },
        { status: 400 }
      );
    }

    // Phase 77: narrowed to only the field read below (role), instead of the full user row.
    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId }, select: { role: true } });
    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'User not found.' } },
        { status: 404 }
      );
    }

    // LAST ADMIN PROTECTION RULE
    if (
      (newRole === UserRole.USER && targetUser.role === UserRole.ADMIN) ||
      (newStatus === UserStatus.DISABLED && targetUser.role === UserRole.ADMIN)
    ) {
      const activeAdminCount = await prisma.user.count({
        where: { role: UserRole.ADMIN, status: UserStatus.ACTIVE }
      });
      if (activeAdminCount <= 1) {
        return NextResponse.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'Cannot remove the final active administrator.' } },
          { status: 403 }
        );
      }
    }

    const updateData: any = {};
    if (newRole && ['ADMIN', 'USER'].includes(newRole)) updateData.role = newRole;
    if (newStatus && ['ACTIVE', 'SUSPENDED', 'DISABLED'].includes(newStatus)) updateData.status = newStatus;

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: updateData,
      select: { id: true, email: true, name: true, role: true, status: true }
    });

    if (newStatus === UserStatus.DISABLED || newStatus === UserStatus.SUSPENDED) {
      await sessionService.invalidateAllUserSessions(targetUserId);
    }

    await auditService.log(authUser.id, 'ADMIN_ACTION', 'USER', targetUserId, { newRole, newStatus });

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
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update user.' } },
      { status: 500 }
    );
  }
}
