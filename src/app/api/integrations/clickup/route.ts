import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { clickUpAuthService } from '@/features/meeting-intelligence';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    await clickUpAuthService.disconnect(authUser.id);

    return NextResponse.json({
      success: true,
      data: { message: 'ClickUp integration disconnected' }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { code: error.code, message: error.message } },
        { status: error.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to disconnect ClickUp' } },
      { status: 500 }
    );
  }
}
