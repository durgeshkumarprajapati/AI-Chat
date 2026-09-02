import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { envConfig } from '@/config/env';

export const dynamic = 'force-dynamic';

/**
 * Client-facing WebRTC ICE server + ring-timeout config. Auth-gated (any authenticated user may
 * fetch this — it is needed before placing or answering any call). Never logs the returned
 * values; TURN credentials are returned in the JSON body only, exactly as any WebRTC client
 * needs them to negotiate a connection.
 */
export async function GET(req: NextRequest) {
  try {
    await getAuthUser(req);

    const iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> = envConfig.webrtc.stunServers
      .map((url) => url.trim())
      .filter(Boolean)
      .map((url) => ({ urls: url }));

    if (envConfig.webrtc.turnServers.length > 0) {
      const turnUrls = envConfig.webrtc.turnServers.map((url) => url.trim()).filter(Boolean);
      if (turnUrls.length > 0) {
        iceServers.push({
          urls: turnUrls,
          username: envConfig.webrtc.turnUsername,
          credential: envConfig.webrtc.turnCredential
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        iceServers,
        ringTimeoutMs: envConfig.webrtc.ringTimeoutMs
      }
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
}
