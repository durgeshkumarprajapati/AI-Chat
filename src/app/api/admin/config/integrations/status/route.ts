import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser, requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { configService } from '@/features/config';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authUser = await requireAuthenticatedUser(req);
    requireRole(authUser, UserRole.ADMIN);

    const integrations = await configService.getIntegrationStatus();

    return NextResponse.json({
      success: true,
      data: { integrations }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve integration status' } },
      { status: 500 }
    );
  }
}
