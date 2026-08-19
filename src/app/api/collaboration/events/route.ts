import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { collabPubSubService, CollabEventPayload } from '@/features/collaboration/pubsub.service';
import { collabPresenceService } from '@/features/collaboration/presence.service';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);

    // Heartbeat user presence
    await collabPresenceService.heartbeat(user.id);

    // Fetch user channels to authorize SSE listener
    const memberships = await prisma.collabChannelMember.findMany({
      where: { userId: user.id },
      select: { channelId: true }
    });

    const userChannelIds = new Set(memberships.map((m) => m.channelId));

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        // Send initial connected payload
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'connected', userId: user.id })}\n\n`)
        );

        const eventHandler = (event: CollabEventPayload) => {
          if (event.channelId === 'global' || userChannelIds.has(event.channelId)) {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            } catch {}
          }
        };

        const unsubscribe = collabPubSubService.subscribeGlobal(eventHandler);

        // Keep-alive ping interval
        const interval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`));
            collabPresenceService.heartbeat(user.id).catch(() => {});
          } catch {
            clearInterval(interval);
            unsubscribe();
          }
        }, 15000);

        req.signal.addEventListener('abort', () => {
          clearInterval(interval);
          unsubscribe();
          collabPresenceService.setPresence(user.id, 'OFFLINE').catch(() => {});
        });
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive'
      }
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
