import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getPredefinedQuestionsForCity } from '@/features/city-explorer/city-explorer.questions';
import { cityExplorerCacheService } from '@/features/city-explorer/city-explorer.cache.service';
import { cityExplorerAnswerService } from '@/features/city-explorer/city-explorer.answer.service';
import { runWithConcurrencyLimit } from '@/lib/performance/concurrency';
import { env } from '@/config/env';
import { CityInfo, CityExplorerAnswerResult } from '@/features/city-explorer/city-explorer.types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const city = (url.searchParams.get('city') || '').trim();
  const region = url.searchParams.get('region') || undefined;
  const country = url.searchParams.get('country') || 'India';

  if (!city) {
    return new Response(JSON.stringify({ error: 'City parameter is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  let userId = 'anonymous-user';
  try {
    const user = await getAuthUser(req);
    if (user?.id) userId = user.id;
  } catch {}

  const cityInfo: CityInfo = { name: city, region, country };
  const targetQuestions = getPredefinedQuestionsForCity(city);
  const totalCount = targetQuestions.length;

  const encoder = new TextEncoder();

  const customReadable = new ReadableStream({
    async start(controller) {
      let completedCount = 0;

      const sendEvent = (data: any) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {}
      };

      // 1. Initial Cache Pass: Send any cached answers immediately (< 50ms)
      const missingQuestions: typeof targetQuestions = [];
      for (const qItem of targetQuestions) {
        const cached = await cityExplorerCacheService.getCachedAnswer(city, qItem.id);
        if (cached?.result) {
          completedCount++;
          sendEvent({
            type: 'answer',
            city,
            questionId: qItem.id,
            answer: cached.result,
            completedCount,
            totalCount
          });
        } else {
          missingQuestions.push(qItem);
        }
      }

      // 2. Parallel Tiered Execution (P0 -> P1 -> P2) for Missing Answers
      if (missingQuestions.length > 0) {
        const p0 = missingQuestions.filter((q) => q.priority === 'P0');
        const p1 = missingQuestions.filter((q) => q.priority === 'P1');
        const p2 = missingQuestions.filter((q) => q.priority === 'P2');

        const maxConcurrency = env.server?.CITY_EXPLORER_MAX_CONCURRENCY ?? 3;

        for (const tierItems of [p0, p1, p2]) {
          if (tierItems.length === 0) continue;

          await runWithConcurrencyLimit(
            tierItems,
            maxConcurrency,
            async (qItem) => {
              let answerRes: CityExplorerAnswerResult;
              const lockOwner = await cityExplorerCacheService.acquireGenerationLock(city, qItem.id);

              try {
                const recheck = await cityExplorerCacheService.getCachedAnswer(city, qItem.id);
                if (recheck?.result) {
                  answerRes = recheck.result;
                } else {
                  answerRes = await cityExplorerAnswerService.generateAnswer(userId, cityInfo, qItem);
                  if (answerRes.status === 'READY' || answerRes.status === 'NO_EVIDENCE') {
                    await cityExplorerCacheService.setCachedAnswer(city, qItem.id, answerRes, qItem.kind);
                  }
                }
              } catch (err: any) {
                answerRes = {
                  questionId: qItem.id,
                  category: qItem.category,
                  question: qItem.question,
                  status: 'FAILED',
                  error: 'Unable to load answer right now.',
                  cached: false,
                  generatedAt: new Date().toISOString()
                };
              } finally {
                if (lockOwner) {
                  await cityExplorerCacheService.releaseGenerationLock(city, qItem.id, lockOwner);
                }
              }

              completedCount++;
              sendEvent({
                type: 'answer',
                city,
                questionId: qItem.id,
                answer: answerRes,
                completedCount,
                totalCount
              });
            }
          );
        }
      }

      sendEvent({ type: 'done', city, completedCount, totalCount });
      controller.close();
    }
  });

  return new Response(customReadable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-City-Provider': 'GEMINI/WEB/WEATHER',
      'X-City-Cache': 'STREAMING'
    }
  });
}
