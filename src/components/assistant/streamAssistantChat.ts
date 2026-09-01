import type { AssistantChatRequest, AssistantStreamEvent } from './assistant.types';

/**
 * Phase 89 — manual SSE-over-POST parsing.
 *
 * The browser's native `EventSource` only supports GET requests, but POST /api/assistant/chat
 * needs a JSON body (conversationId/message/contextHint/scope), so the stream is read by hand:
 * `fetch` + `ReadableStream` + a small line parser. The wire format mirrors the existing
 * `/api/chat/stream` route (confirmed by reading `src/app/api/chat/stream/route.ts`):
 * `event: ${event}\ndata: ${JSON.stringify(data)}\n\n` — frames are separated by a blank line,
 * and each frame carries one `event:` line and one (or more, rare) `data:` line(s).
 *
 * Passing an `AbortController.signal` lets the caller implement the composer's "Stop" button —
 * aborting the fetch ends the read loop (a thrown `AbortError` propagates to the caller, who is
 * expected to treat it as a silent user-initiated stop rather than an error state).
 */
export async function streamAssistantChat(
  request: AssistantChatRequest,
  onEvent: (_event: AssistantStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch('/api/assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal
  });

  if (!res.ok || !res.body) {
    let message = `Assistant request failed with status ${res.status}.`;
    try {
      const body = await res.json();
      message = body?.error?.message || (typeof body?.error === 'string' ? body.error : message);
    } catch {
      // Response body wasn't JSON (or was already consumed) — keep the default message.
    }
    onEvent({ event: 'error', data: { code: 'REQUEST_FAILED', message } });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split('\n\n');
    // The last split segment may be an incomplete frame still being streamed in — hold it back.
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      const parsed = parseFrame(frame);
      if (parsed) onEvent(parsed);
    }
  }

  const trailing = buffer.trim();
  if (trailing) {
    const parsed = parseFrame(trailing);
    if (parsed) onEvent(parsed);
  }
}

function parseFrame(frame: string): AssistantStreamEvent | null {
  let eventName = '';
  const dataLines: string[] = [];

  for (const rawLine of frame.split('\n')) {
    const line = rawLine.trimEnd();
    if (line.startsWith('event:')) {
      eventName = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trim());
    }
  }

  if (!eventName || dataLines.length === 0) return null;

  try {
    const data = JSON.parse(dataLines.join('\n'));
    return { event: eventName, data } as AssistantStreamEvent;
  } catch {
    return null;
  }
}
