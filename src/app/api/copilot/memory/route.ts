import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { copilotMemoryService } from '@/features/copilot/memory/copilot-memory.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || undefined;

    const memories = await copilotMemoryService.getMemories(user.id, projectId);
    return NextResponse.json({ success: true, data: memories });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json();

    if (!body.key || !body.value) {
      return NextResponse.json({ success: false, error: 'key and value are required' }, { status: 400 });
    }

    const memory = await copilotMemoryService.upsertMemory(user.id, {
      category: body.category || 'PROJECT_CONTEXT',
      key: body.key,
      value: body.value,
      projectId: body.projectId,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined
    });

    return NextResponse.json({ success: true, data: memory }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId') || undefined;

    await copilotMemoryService.clearAllMemories(user.id, projectId);
    return NextResponse.json({ success: true, message: 'All memories cleared' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
