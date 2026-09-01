import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { copilotMemoryService } from '@/features/copilot/memory/copilot-memory.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

/**
 * Phase 90 — GET/PATCH the durable per-user memory settings row (MemorySettings). This is the
 * real backend for the existing /settings/copilot-memory page's `memoryEnabled` toggle, which
 * today is local component state only and never persisted anywhere.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const settings = await copilotMemoryService.getMemorySettings(user.id);
    return NextResponse.json({ success: true, data: settings });
  } catch (err: any) {
    if (err instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: err.code, message: err.message } }, { status: err.statusCode });
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));

    const patch: Record<string, boolean> = {};
    for (const field of ['memoryEnabled', 'autoLearnEnabled', 'projectMemoryEnabled', 'conversationMemoryEnabled'] as const) {
      if (typeof body[field] === 'boolean') {
        patch[field] = body[field];
      }
    }

    const settings = await copilotMemoryService.updateMemorySettings(user.id, patch);
    return NextResponse.json({ success: true, data: settings });
  } catch (err: any) {
    if (err instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: err.code, message: err.message } }, { status: err.statusCode });
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
