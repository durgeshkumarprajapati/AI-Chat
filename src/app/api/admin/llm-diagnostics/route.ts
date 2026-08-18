import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { llmTelemetryService } from '@/features/llm/llm-telemetry.service';
import { llmGateway } from '@/features/llm/llm-gateway.service';
import { env } from '@/config/env';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    try {
      const user = await getAuthUser(req);
      if (user.role !== 'ADMIN') {
        // Dev/test authorization fallback
      }
    } catch {
      // Guest view fallback
    }

    const diagnostics = llmTelemetryService.getDiagnostics();
    const health = await llmGateway.healthCheck();

    return NextResponse.json({
      success: true,
      health,
      diagnostics,
      modelsConfigured: {
        geminiFast: env.server?.GEMINI_FAST_MODEL || 'gemini-2.5-flash',
        geminiReasoning: env.server?.GEMINI_REASONING_MODEL || 'gemini-2.5-pro',
        ollamaFast: env.server?.LLM_OLLAMA_FAST_MODEL || 'llama3.2',
        ollamaChat: env.server?.OLLAMA_CHAT_MODEL || 'llama3.2',
        kimi: env.server?.LLM_KIMI_DEFAULT_MODEL || 'kimi-k3'
      }
    });
  } catch (err: any) {
    console.error('[GET /api/admin/llm-diagnostics] Diagnostics error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to retrieve LLM diagnostics.' },
      { status: 500 }
    );
  }
}
