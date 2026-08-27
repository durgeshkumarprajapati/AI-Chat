import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, requireRole } from '@/lib/auth';
import { UserRole, ConfigCategory } from '@prisma/client';
import { configService } from '@/features/config';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    requireRole(authUser, UserRole.ADMIN);

    const { searchParams } = new URL(req.url);
    const categoryParam = searchParams.get('category');
    const isActiveParam = searchParams.get('isActive');

    const category = categoryParam ? (categoryParam as ConfigCategory) : undefined;
    const isActive = isActiveParam === 'true' ? true : isActiveParam === 'false' ? false : undefined;

    const configs = await configService.listConfigs({ category, isActive });

    return NextResponse.json({
      success: true,
      data: { configs }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to list configurations' } },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    requireRole(authUser, UserRole.ADMIN);

    const body = await req.json().catch(() => ({}));

    const config = await configService.createConfig({
      key: body.key,
      value: body.value,
      valueType: body.valueType,
      category: body.category,
      purpose: body.purpose,
      description: body.description,
      isActive: body.isActive,
      isSystem: body.isSystem,
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
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create configuration' } },
      { status: 500 }
    );
  }
}
