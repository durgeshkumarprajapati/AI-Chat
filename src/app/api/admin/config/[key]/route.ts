import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { configService } from '@/features/config';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { key: string } }) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    requireRole(authUser, UserRole.ADMIN);

    const config = await configService.get(params.key);
    if (!config) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: `Configuration with key "${params.key}" not found` } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { config }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve configuration' } },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { key: string } }) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    requireRole(authUser, UserRole.ADMIN);

    const body = await req.json().catch(() => ({}));

    const config = await configService.updateConfig(params.key, {
      value: body.value,
      valueType: body.valueType,
      category: body.category,
      purpose: body.purpose,
      description: body.description,
      isActive: body.isActive,
      actorId: authUser.id
    });

    return NextResponse.json({
      success: true,
      data: { config }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update configuration' } },
      { status: 500 }
    );
  }
}
