import { NextRequest, NextResponse } from 'next/server';
import { webSourceService } from '@/features/rag/web/web-source.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';

function getUserId(req: NextRequest): string {
  return req.headers.get('x-user-id') || DEFAULT_USER_ID;
}

export async function POST(req: NextRequest) {
  try {
    const userId = getUserId(req);
    const body = await req.json();

    if (!body.url || typeof body.url !== 'string') {
      return NextResponse.json(
        { success: false, error: { message: 'URL is required' } },
        { status: 400 }
      );
    }

    const webSource = await webSourceService.createWebSource(userId, {
      url: body.url,
      knowledgeBaseId: body.knowledgeBaseId
    });

    return NextResponse.json({ success: true, data: webSource }, { status: 201 });
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

export async function GET(req: NextRequest) {
  try {
    const userId = getUserId(req);
    const webSources = await webSourceService.listWebSources(userId);
    return NextResponse.json({ success: true, data: { items: webSources } });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json(
        { success: false, error: { message: err.message, code: err.code } },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { success: false, error: { message: 'Failed to list web sources' } },
      { status: 500 }
    );
  }
}
