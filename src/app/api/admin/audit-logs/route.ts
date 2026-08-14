import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { UserRole } from '@prisma/client';
import { AppError } from '@/errors';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    requireRole(authUser, UserRole.ADMIN);

    const searchParams = req.nextUrl.searchParams;
    const action = searchParams.get('action')?.trim();
    const actorId = searchParams.get('actorId')?.trim();
    const limit = Math.min(Number(searchParams.get('limit') || 100), 200);

    const logs = await prisma.auditLog.findMany({
      where: {
        action: action ? action : undefined,
        actorId: actorId ? actorId : undefined
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: { id: true, email: true, name: true, role: true }
        }
      }
    });

    return NextResponse.json({
      success: true,
      data: logs
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to fetch audit logs.' } },
      { status: 500 }
    );
  }
}
