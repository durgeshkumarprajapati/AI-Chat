import { NextRequest } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth';
import { assistantOrchestratorService } from '@/features/assistant/orchestration/assistant-orchestrator.service';
import { AppError } from '@/errors';
import { AssistantChatRequest, AssistantStreamEvent } from '@/features/assistant/types/assistant.types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/assistant/chat — the Assistant's single streaming entrypoint.
 *
 * Mirrors /api/chat/stream/route.ts's exact SSE wire format: `event: ${event}\ndata:
 * ${JSON.stringify(data)}\n\n`, one event per line, closing the stream cleanly on completion,
 * client abort, or error. All authorization/entitlement/rate-limit/validation errors thrown
 * BEFORE the stream begins are returned as ordinary JSON error responses; everything the
 * orchestrator raises DURING streaming is instead delivered as an in-band `error` SSE event (see
 * assistant-orchestrator.service.ts step 16) so the connection always closes cleanly.
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireAuthenticatedUser(req);
  } catch (error) {
    if (error instanceof AppError) {
      return new Response(JSON.stringify({ success: false, error: { code: error.code, message: error.message } }), {
        status: error.statusCode,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ success: false, error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const body = await req.json().catch(() => ({}));
  if (!body || typeof body.message !== 'string' || body.message.trim() === '') {
    return new Response(
      JSON.stringify({ success: false, error: { code: 'VALIDATION_ERROR', message: 'message is required and must be a non-empty string.' } }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const chatRequest: AssistantChatRequest = {
    conversationId: typeof body.conversationId === 'string' ? body.conversationId : undefined,
    message: body.message,
    contextHint: typeof body.contextHint === 'object' && body.contextHint !== null ? body.contextHint : undefined,
    scope: typeof body.scope === 'string' ? body.scope : undefined
  };

  const stream = assistantOrchestratorService.streamChat(user.id, chatRequest);

  // Prime the generator up to its FIRST yield (which is either the `start` event, or an in-band
  // `error` event for a config-disabled/rate-limited turn — see the orchestrator's step 2/4,
  // which yield rather than throw). Anything the orchestrator instead THROWS before its first
  // yield (entitlement denial, request validation) surfaces here as a normal exception, so it is
  // caught below and returned as an ordinary JSON error response BEFORE any SSE stream begins —
  // exactly like every other API route's `AppError` handling in this codebase.
  let primed: IteratorResult<AssistantStreamEvent>;
  try {
    primed = await stream.next();
  } catch (error) {
    if (error instanceof AppError) {
      return new Response(JSON.stringify({ success: false, error: { code: error.code, message: error.message } }), {
        status: error.statusCode,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error.' } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const encoder = new TextEncoder();

  const customReadable = new ReadableStream({
    async start(controller) {
      function sendEvent(event: string, data: unknown) {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller may be closed
        }
      }

      try {
        if (!primed.done && primed.value) {
          sendEvent(primed.value.event, primed.value.data);
        }

        if (!primed.done) {
          for await (const evt of stream) {
            if (req.signal.aborted) {
              console.log('[AssistantChatStream] Client connection aborted.');
              break;
            }
            sendEvent(evt.event, evt.data);
          }
        }
      } catch (error) {
        const message = error instanceof AppError ? error.message : 'An error occurred during streaming.';
        const code = error instanceof AppError ? error.code : 'INTERNAL_SERVER_ERROR';
        sendEvent('error', { code, message });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }
    }
  });

  return new Response(customReadable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    }
  });
}
