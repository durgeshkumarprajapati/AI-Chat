import { NextRequest, NextResponse } from 'next/server';
import { webSourceService } from '@/features/rag/web/web-source.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';

function getUserId(req: NextRequest): string {
  return req.headers.get('x-user-id') || DEFAULT_USER_ID;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = getUserId(req);
    const webSource = await webSourceService.getWebSource(userId, params.id);
    return NextResponse.json({ success: true, data: webSource });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { message: err.message, code: err.code } },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { message: 'Web source not found' } },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = getUserId(req);
    await webSourceService.deleteWebSource(userId, params.id);
    return NextResponse.json({ success: true, message: 'Web source deleted successfully' });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { message: err.message, code: err.code } },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { message: 'Failed to delete web source' } },
      { status: 500 }
    );
  }
}
