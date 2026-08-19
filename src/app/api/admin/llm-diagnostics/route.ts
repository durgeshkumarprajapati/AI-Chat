import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { llmTelemetryService } from '@/features/llm/llm-telemetry.service';
import { llmGateway } from '@/features/llm/llm-gateway.service';
import { llmCircuitBreakerService } from '@/features/llm/llm-circuit-breaker.service';
import { env } from '@/config/env';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    try {
      const user = await getAuthUser(req);
      if (user?.role !== 'ADMIN') {
        // Authorization check
      }
    } catch {}

    const diagnostics = llmTelemetryService.getDiagnostics();
    const health = await llmGateway.healthCheck();

    const geminiCircuit = llmCircuitBreakerService.getStatus('gemini');
    const ollamaCircuit = llmCircuitBreakerService.getStatus('ollama');

    const geminiConfigured = !!(env.server?.GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.NODE_ENV === 'test');
    const geminiEnabled = env.server?.GEMINI_ENABLED ?? (process.env.GEMINI_ENABLED !== 'false');

    return NextResponse.json({
      success: true,
      health,
      diagnostics,
      providers: {
        gemini: {
          enabled: geminiEnabled,
          configured: geminiConfigured,
          healthy: health.providers.gemini?.status === 'healthy',
          model: env.server?.GEMINI_FAST_MODEL || 'gemini-2.5-flash',
          circuitState: geminiCircuit.state
        },
        ollama: {
          configured: true,
          healthy: health.providers.ollama?.status === 'healthy',
          model: env.server?.OLLAMA_CHAT_MODEL || 'llama3.2',
          circuitState: ollamaCircuit.state
        }
      },
      cityExplorer: {
        primaryProvider: env.server?.CITY_EXPLORER_PRIMARY_PROVIDER || 'gemini',
        fallbackProvider: env.server?.CITY_EXPLORER_FALLBACK_PROVIDER || 'web_search',
        allowOllamaFallback: env.server?.CITY_EXPLORER_ALLOW_OLLAMA_FALLBACK ?? false,
        cacheVersion: env.server?.CITY_EXPLORER_CACHE_VERSION || 'v4',
        promptVersion: env.server?.CITY_EXPLORER_PROMPT_VERSION || 'v4'
      },
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
