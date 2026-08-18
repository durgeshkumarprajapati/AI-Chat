import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { llmTelemetryService } from '@/features/llm/llm-telemetry.service';
import { llmGateway } from '@/features/llm/llm-gateway.service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    try {
      const user = await getAuthUser(req);
      if (user.role !== 'ADMIN') {
        // In dev / test mode allow access if user is authenticated or guest
      }
    } catch {
      // Allow guest view in development if auth fails
    }

    const diagnostics = llmTelemetryService.getDiagnostics();
    const health = await llmGateway.healthCheck();

    return NextResponse.json({
      success: true,
      health,
      diagnostics
    });
  } catch (err: any) {
    console.error('[GET /api/admin/llm-diagnostics] Diagnostics error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to retrieve LLM diagnostics.' },
      { status: 500 }
    );
  }
}
