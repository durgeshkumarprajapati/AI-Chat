import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { cityExplorerAnswerService } from '@/features/city-explorer/city-explorer.answer.service';
import { cityExplorerCacheService } from '@/features/city-explorer/city-explorer.cache.service';
import { cityExplorerTelemetryService } from '@/features/city-explorer/city-explorer.telemetry.service';
import { findQuestionById } from '@/features/city-explorer/city-explorer.questions';
import { CityInfo, PredefinedQuestionItem } from '@/features/city-explorer/city-explorer.types';
import { redis } from '@/lib/redis';
import { env } from '@/config/env';

export const dynamic = 'force-dynamic';

const ipRateLimitMap = new Map<string, { count: number; resetAt: number }>();

async function checkRateLimit(identifier: string): Promise<boolean> {
  const limit = env.server?.CITY_EXPLORER_REQUESTS_PER_MINUTE ?? 60;
  const windowMs = 60 * 1000;
  const now = Date.now();

  try {
    const client = await redis.getClient();
    const redisKey = `ratelimit:explore:answer:${identifier}`;
    const current = await client.incr(redisKey);
    if (current === 1) {
      await client.expire(redisKey, 60);
    }
    return current <= limit;
  } catch {
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
  const startTime = Date.now();
  try {
    let userId = 'anonymous-user';
    try {
      const user = await getAuthUser(req);
      if (user && user.id) {
        userId = user.id;
      }
    } catch {}

    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const rateLimitKey = `${userId}:${ip}`;
    const isAllowed = await checkRateLimit(rateLimitKey);

    if (!isAllowed) {
      return NextResponse.json(
        { success: false, error: 'Rate limit exceeded for explore answers. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const city = typeof body.city === 'string' ? body.city.trim() : '';
    const questionText = typeof body.question === 'string' ? body.question.trim() : '';
    const category = typeof body.category === 'string' ? body.category.trim() : 'general';
    const forceRefresh = Boolean(body.forceRefresh || body.refresh);
    const context = Array.isArray(body.context) ? body.context : undefined;

    if (!city || !questionText) {
      return NextResponse.json(
        { success: false, error: 'City and question parameters are required.' },
        { status: 400 }
      );
    }

    cityExplorerTelemetryService.logEvent('explore.ai.request.started', city, undefined, userId, {
      category,
      questionText,
      forceRefresh
    });

    const cityInfo: CityInfo = { name: city, region: body.region, country: body.country };

    // Resolve or build question item
    let questionItem: PredefinedQuestionItem | undefined = findQuestionById(body.questionId || '', city) || undefined;

    if (!questionItem) {
      questionItem = {
        id: body.questionId || `q_${Date.now()}`,
        category,
        categoryIcon: '📍',
        question: questionText,
        kind: 'STATIC',
        priority: 'P0'
      };
    }

    // 1. Cache Check if not force refreshing
    if (!forceRefresh) {
      const cached = await cityExplorerCacheService.getCachedAnswer(city, questionItem.id);
      if (cached && cached.result && cached.result.status === 'READY') {
        cityExplorerTelemetryService.logEvent('explore.ai.cache.hit', city, questionItem.id, userId);
        return NextResponse.json({
          success: true,
          data: {
            city: cityInfo.name,
            category: cached.result.category,
            question: cached.result.question,
            answer: cached.result.answer,
            confidence: cached.result.confidence || 'medium',
            highlights: cached.result.highlights || [],
            citations: cached.result.citations || [],
            cached: true,
            generatedAt: cached.result.generatedAt || new Date().toISOString()
          }
        });
      }
    }

    cityExplorerTelemetryService.logEvent('explore.ai.cache.miss', city, questionItem.id, userId, { forceRefresh });

    // 2. Generate Answer using Gemini via LLMGateway
    const generated = await cityExplorerAnswerService.generateAnswer(userId, cityInfo, questionItem, undefined, context);

    if (generated.status === 'READY') {
      await cityExplorerCacheService.setCachedAnswer(city, questionItem.id, generated, questionItem.kind);
    }

    return NextResponse.json({
      success: true,
      data: {
        city: cityInfo.name,
        category: generated.category,
        question: generated.question,
        answer: generated.answer || 'AI answer is temporarily unavailable.',
        confidence: generated.confidence || 'medium',
        highlights: generated.highlights || [],
        citations: generated.citations || [],
        cached: false,
        generatedAt: generated.generatedAt || new Date().toISOString(),
        durationMs: Date.now() - startTime
      }
    });
  } catch (err: any) {
    console.error('[POST /api/explore/answer] API error:', err);
    return NextResponse.json(
      { success: false, error: 'AI answer is temporarily unavailable.' },
      { status: 500 }
    );
  }
}
