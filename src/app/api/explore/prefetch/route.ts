import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { cityExplorerPrefetchService } from '@/features/city-explorer/city-explorer.prefetch.service';
import { redis } from '@/lib/redis';
import { env } from '@/config/env';

export const dynamic = 'force-dynamic';

// Rate Limiting Store
const ipRateLimitMap = new Map<string, { count: number; resetAt: number }>();

async function checkRateLimit(identifier: string): Promise<boolean> {
  const limit = env.server?.CITY_EXPLORER_RATE_LIMIT_PER_MINUTE ?? 60;
  const windowMs = 60 * 1000;
  const now = Date.now();

  try {
    const client = await redis.getClient();
    const redisKey = `ratelimit:cityexplorer:${identifier}`;
    const current = await client.incr(redisKey);
    if (current === 1) {
      await client.expire(redisKey, 60);
    }
    return current <= limit;
  } catch {
    // In-memory fallback rate limit
    let entry = ipRateLimitMap.get(identifier);
    if (!entry || now > entry.resetAt) {
      entry = { count: 1, resetAt: now + windowMs };
      ipRateLimitMap.set(identifier, entry);
      return true;
    }
    entry.count++;
    return entry.count <= limit;
  }
}

export async function POST(req: NextRequest) {
  try {
    let userId = 'anonymous-user';
    try {
      const user = await getAuthUser(req);
      if (user && user.id) {
        userId = user.id;
      }
    } catch {
      // Allow guest/public browsing if auth fails or not provided
    }

    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const rateLimitKey = `${userId}:${ip}`;
    const isAllowed = await checkRateLimit(rateLimitKey);

    if (!isAllowed) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded for city prefetch. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const city = (body.city || '').trim();

    if (!city) {
      return NextResponse.json(
        { success: false, error: 'Valid city parameter is required.' },
        { status: 400 }
      );
    }

    // Extract optional array of question items or IDs
    let questionIds: string[] | undefined = undefined;
    if (Array.isArray(body.questions) && body.questions.length > 0) {
      questionIds = body.questions
        .map((q: any) => (typeof q === 'string' ? q : q.id || q.questionId))
        .filter(Boolean);
    } else if (Array.isArray(body.questionIds)) {
      questionIds = body.questionIds.filter((id: any) => typeof id === 'string');
    }

    const payload = await cityExplorerPrefetchService.prefetchAnswers(userId, {
      city,
      region: body.region,
      country: body.country,
      questionIds,
      forceRefreshQuestionId: body.forceRefreshQuestionId
    });

    return NextResponse.json(payload, { status: 200 });
  } catch (err: any) {
    console.error('[POST /api/explore/prefetch] API error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to prefetch city answers.' },
      { status: 500 }
    );
  }
}
