import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { copilotMemoryService } from '@/features/copilot/memory/copilot-memory.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser(req);
    await copilotMemoryService.deleteMemory(params.id, user.id);
    return NextResponse.json({ success: true, message: 'Memory deleted' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

/**
 * Phase 90 — updates a single memory's value/importance. Added alongside the existing DELETE
 * handler above (untouched). Ownership is enforced inside `updateMemory` (404 for a non-owned
 * id, never trusting a client-supplied userId).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));

    const patch: { value?: string; importance?: number } = {};
    if (typeof body.value === 'string') patch.value = body.value;
    if (typeof body.importance === 'number') patch.importance = body.importance;

    const memory = await copilotMemoryService.updateMemory(user.id, params.id, patch);
    return NextResponse.json({ success: true, data: memory });
  } catch (err: any) {
    if (err instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: err.code, message: err.message } }, { status: err.statusCode });
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
