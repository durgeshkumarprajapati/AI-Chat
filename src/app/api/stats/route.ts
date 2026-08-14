import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { documentRepository } from '@/features/documents/repositories/document.repository';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const stats = await documentRepository.getDashboardStats(authUser.id);

    return NextResponse.json({
      success: true,
      data: stats
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }

    console.error('Failed to retrieve dashboard stats:', error);
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve stats' } },
      { status: 500 }
    );
  }
}
