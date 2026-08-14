import { NextRequest, NextResponse } from 'next/server';
import { webSourceService } from '@/features/rag/web/web-source.service';
import { AppError } from '@/errors';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';

function getUserId(req: NextRequest): string {
  return req.headers.get('x-user-id') || DEFAULT_USER_ID;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = getUserId(req);
    const result = await webSourceService.refreshWebSource(userId, params.id);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { message: err.message, code: err.code } },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { message: err instanceof Error ? err.message : String(err) } },
      { status: 500 }
    );
  }
}
