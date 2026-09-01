import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { copilotMemoryService } from '@/features/copilot/memory/copilot-memory.service';
import { memoryExportRateLimitService } from '@/features/copilot/memory/memory-export-rate-limit.service';
import { AppError } from '@/errors';

export const dynamic = 'force-dynamic';

/**
 * Phase 90 — GET /api/copilot/memory/export. Returns the user's own memories as a downloadable
 * JSON attachment. No existing file-storage subsystem fits a small, user-scoped export like this
 * — a direct JSON response with `Content-Disposition: attachment` is the minimal correct choice
 * (no streaming, no new storage subsystem). Lightly rate-limited since a full-history read is
 * heavier than a normal memory-list fetch.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);

    const withinLimit = await memoryExportRateLimitService.checkUserHourlyLimit(user.id);
    if (!withinLimit) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'Too many export requests. Please try again later.' } },
        { status: 429 }
      );
    }

    const payload = await copilotMemoryService.exportUserMemories(user.id);

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="ai-memory-export.json"'
      }
    });
  } catch (err: any) {
    if (err instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: err.code, message: err.message } }, { status: err.statusCode });
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
