import { NextRequest, NextResponse } from 'next/server';
import { webSourceService } from '@/features/rag/web/web-source.service';

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id') || '77777777-aaaa-4000-a000-111111111111';
    const body = await req.json();

    const { url, knowledgeBaseId } = body;
    if (!url) {
      return NextResponse.json(
        { success: false, error: { message: 'Missing required field: url' } },
        { status: 400 }
      );
    }

    const result = await webSourceService.createWebSource(userId, {
      url,
      knowledgeBaseId: knowledgeBaseId || undefined
    });

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('POST /api/web-sources/save-discovered failed:', err);
    return NextResponse.json(
      {
        success: false,
        error: { message: err instanceof Error ? err.message : String(err) }
      },
      { status: 400 }
    );
  }
}
