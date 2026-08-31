import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { listRegisteredTools } from '@/features/ai-agent/tool-registry';

export const dynamic = 'force-dynamic';

/**
 * GET /api/agents/tools — returns the static registered tool definitions (name, description, inputSchema, riskLevel, requiresApproval).
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuthenticatedUser(req);
    const tools = listRegisteredTools().map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      riskLevel: t.riskLevel,
      requiresApproval: t.requiresApproval,
      timeoutMs: t.timeoutMs,
      idempotent: t.idempotent
    }));

    return NextResponse.json({ success: true, data: tools });
  } catch (err: any) {
    const status = typeof err?.statusCode === 'number' ? err.statusCode : 400;
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
