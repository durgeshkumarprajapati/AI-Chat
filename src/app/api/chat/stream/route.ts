import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { chatService } from '@/features/rag/chat/chat.service';
import { AppError } from '@/errors';

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));

    if (!body || typeof body.question !== 'string' || body.question.trim() === '') {
      return new Response(
        JSON.stringify({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Question parameter is required and must be a non-empty string.' } }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
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
          const stream = chatService.streamMessage(authUser.id, {
            conversationId: body.conversationId,
            question: body.question,
            knowledgeBaseId: body.knowledgeBaseId
          });

          for await (const evt of stream) {
            if (req.signal.aborted) {
              console.log('[ChatStream] Client connection aborted.');
              break;
            }
            sendEvent(evt.type, evt);
          }
        } catch (error) {
          const message = error instanceof AppError ? error.message : (error instanceof Error ? error.message : 'An error occurred during streaming.');
          sendEvent('error', { message });
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
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return new Response(
        JSON.stringify({ success: false, error: { code: error.code, message: error.message } }),
        { status: error.statusCode, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error.' } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
