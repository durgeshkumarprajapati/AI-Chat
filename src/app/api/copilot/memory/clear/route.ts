import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { copilotMemoryService } from '@/features/copilot/memory/copilot-memory.service';
import { AppError, ValidationError } from '@/errors';

export const dynamic = 'force-dynamic';

const VALID_SCOPES = ['CONVERSATION', 'PROJECT', 'ALL'] as const;

/**
 * Phase 90 — POST /api/copilot/memory/clear { scope, projectId? }. A new, additive route — the
 * existing DELETE on /api/copilot/memory (clear-all-or-by-project) is left untouched; this adds
 * the finer-grained CONVERSATION/PROJECT/ALL scoping the settings UI needs.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));

    if (!VALID_SCOPES.includes(body?.scope)) {
      throw new ValidationError(`scope must be one of ${VALID_SCOPES.join(', ')}.`);
    }

    const result = await copilotMemoryService.clearMemoriesByScope(
      user.id,
      body.scope,
      typeof body.projectId === 'string' ? body.projectId : undefined
    );

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    if (err instanceof AppError) {
      return NextResponse.json({ success: false, error: { code: err.code, message: err.message } }, { status: err.statusCode });
    }
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
