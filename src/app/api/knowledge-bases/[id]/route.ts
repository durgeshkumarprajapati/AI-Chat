import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { knowledgeBaseService } from '@/features/knowledge-bases/services/knowledge-base.service';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(req);
    const detail = await knowledgeBaseService.getKnowledgeBase(user.id, params.id);

    return NextResponse.json({
      success: true,
      data: detail
    });
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode || 500;
    const message = (error as Error).message || 'Internal Server Error';
    return NextResponse.json({ success: false, error: { message } }, { status: statusCode });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();

    const updated = await knowledgeBaseService.updateKnowledgeBase(user.id, params.id, {
      name: body.name,
      description: body.description
    });

    return NextResponse.json({
      success: true,
      data: updated
    });
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode || 500;
    const message = (error as Error).message || 'Internal Server Error';
    return NextResponse.json({ success: false, error: { message } }, { status: statusCode });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getAuthUser(req);
    await knowledgeBaseService.deleteKnowledgeBase(user.id, params.id);

    return NextResponse.json({
      success: true,
      message: 'Knowledge base deleted successfully'
    });
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode || 500;
    const message = (error as Error).message || 'Internal Server Error';
    return NextResponse.json({ success: false, error: { message } }, { status: statusCode });
  }
}
