import { NextRequest, NextResponse } from 'next/server';
import { knowledgeBaseService } from '@/features/knowledge-bases/services/knowledge-base.service';
import { webSourceService } from '@/features/rag/web/web-source.service';
import { AppError } from '@/errors';

const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000000';

function getUserId(req: NextRequest): string {
  return req.headers.get('x-user-id') || DEFAULT_USER_ID;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = getUserId(req);
    const body = await req.json();

    if (body.webSourceId) {
      // Add existing web source to KB
      const kbDoc = await knowledgeBaseService.addDocumentToKnowledgeBase(userId, params.id, body.webSourceId);
      return NextResponse.json({ success: true, data: kbDoc }, { status: 201 });
    }

    if (body.url) {
      // Ingest new web source directly into KB
      const webSource = await webSourceService.createWebSource(userId, {
        url: body.url,
        knowledgeBaseId: params.id
      });
      return NextResponse.json({ success: true, data: webSource }, { status: 201 });
    }

    return NextResponse.json(
      { success: false, error: { message: 'Either url or webSourceId is required' } },
      { status: 400 }
    );
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
