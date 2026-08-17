import { env } from '@/config/env';
import {
  PrefetchRequestInput,
  PrefetchResponsePayload,
  CityExplorerAnswerResult,
  CityInfo,
  PredefinedQuestionItem
} from './city-explorer.types';
import { getPredefinedQuestionsForCity, findQuestionById } from './city-explorer.questions';
import { cityExplorerCacheService, CityExplorerCacheService } from './city-explorer.cache.service';
import { cityExplorerAnswerService, CityExplorerAnswerService } from './city-explorer.answer.service';
import { cityExplorerTelemetryService } from './city-explorer.telemetry.service';

export class CityExplorerPrefetchService {
  private cache: CityExplorerCacheService;
  private answerService: CityExplorerAnswerService;

  constructor(cache?: CityExplorerCacheService, answerService?: CityExplorerAnswerService) {
    this.cache = cache || cityExplorerCacheService;
    this.answerService = answerService || cityExplorerAnswerService;
  }

  /**
   * Main prefetch entry point. Validates city & questions, executes cache lookups,
   * schedules missing answer generations with bounded concurrency, and returns normalized payload.
   */
  public async prefetchAnswers(
    userId: string,
    input: PrefetchRequestInput
  ): Promise<PrefetchResponsePayload> {
    const startTime = Date.now();
    const rawCity = (input.city || '').trim();

    if (!rawCity) {
      throw new Error('City parameter is required for prefetch.');
    }

    const cityInfo: CityInfo = {
      name: rawCity,
      region: input.region || undefined,
      country: input.country || 'India'
    };

    // Resolve questions against trusted server-side registry
    const registryQuestions = getPredefinedQuestionsForCity(rawCity);
    let targetQuestions: PredefinedQuestionItem[] = [];

    if (input.questionIds && Array.isArray(input.questionIds) && input.questionIds.length > 0) {
      const uniqueIds = Array.from(new Set(input.questionIds));
      for (const qId of uniqueIds) {
        const found = findQuestionById(qId, rawCity);
        if (found) {
          targetQuestions.push(found);
        }
      }
    } else {
      targetQuestions = registryQuestions;
    }

    if (targetQuestions.length === 0) {
      targetQuestions = registryQuestions;
    }

    cityExplorerTelemetryService.logEvent('city_explorer.prefetch.started', rawCity, undefined, userId, {
      questionCount: targetQuestions.length,
      forceRefreshQuestionId: input.forceRefreshQuestionId
    });

    const maxConcurrency = env.server?.CITY_EXPLORER_MAX_CONCURRENT_QUERIES ?? 3;
    const resultsMap: Map<string, CityExplorerAnswerResult> = new Map();
    const missingQuestions: PredefinedQuestionItem[] = [];

    // 1. Initial Cache Check Phase
    for (const qItem of targetQuestions) {
      const isForceRefresh = input.forceRefreshQuestionId === qItem.id;

      if (!isForceRefresh) {
        const cachedEntry = await this.cache.getCachedAnswer(rawCity, qItem.id);
        if (cachedEntry && cachedEntry.result) {
          resultsMap.set(qItem.id, cachedEntry.result);
          cityExplorerTelemetryService.logEvent('city_explorer.answer.cache_hit', rawCity, qItem.id, userId);
          continue;
        }
      }

      cityExplorerTelemetryService.logEvent('city_explorer.answer.cache_miss', rawCity, qItem.id, userId, {
        isForceRefresh
      });
      missingQuestions.push(qItem);
    }

    // 2. Bounded Concurrency Worker Pool Phase for Missing Answers
    if (missingQuestions.length > 0) {
      await this.processWorkerPool(
        missingQuestions,
        maxConcurrency,
        async (qItem) => {
          const fingerprint = this.cache.computeFingerprint(rawCity, qItem.id);
          const lockOwner = await this.cache.acquireGenerationLock(fingerprint);

          try {
            // Re-check cache after lock acquisition in case another worker populated it
            if (!input.forceRefreshQuestionId || input.forceRefreshQuestionId !== qItem.id) {
              const recheck = await this.cache.getCachedAnswer(rawCity, qItem.id);
              if (recheck && recheck.result) {
                resultsMap.set(qItem.id, recheck.result);
                return;
              }
            }

            const generated = await this.answerService.generateAnswer(userId, cityInfo, qItem);

            if (generated.status === 'READY' || generated.status === 'NO_EVIDENCE') {
              await this.cache.setCachedAnswer(rawCity, qItem.id, generated, qItem.kind);
            }

            resultsMap.set(qItem.id, generated);
          } catch (err) {
            console.error(`[CityExplorerPrefetchService] Worker error generating question ${qItem.id}:`, err);
            resultsMap.set(qItem.id, {
              questionId: qItem.id,
              category: qItem.category,
              question: qItem.question,
              status: 'FAILED',
              error: 'Unable to load this answer right now.',
              cached: false,
              generatedAt: new Date().toISOString()
            });
          } finally {
            if (lockOwner) {
              await this.cache.releaseGenerationLock(fingerprint, lockOwner);
            }
          }
        }
      );
    }

    // Assemble final output in exact registry order
    const finalAnswers: CityExplorerAnswerResult[] = targetQuestions.map((q) => {
      return (
        resultsMap.get(q.id) || {
          questionId: q.id,
          category: q.category,
          question: q.question,
          status: 'FAILED',
          error: 'Answer processing interrupted.',
          cached: false,
          generatedAt: new Date().toISOString()
        }
      );
    });

    cityExplorerTelemetryService.logEvent('city_explorer.prefetch.completed', rawCity, undefined, userId, {
      totalQuestions: targetQuestions.length,
      cachedCount: targetQuestions.length - missingQuestions.length,
      durationMs: Date.now() - startTime
    });

    return {
      success: true,
      city: cityInfo,
      answers: finalAnswers
    };
  }

  /**
   * Controlled promise pool for executing async tasks with bounded concurrency.
   */
  private async processWorkerPool<T>(
    items: T[],
    concurrency: number,
    taskFn: (_item: T) => Promise<void>
  ): Promise<void> {
    const queue = [...items];
    const workers = Array(Math.min(concurrency, queue.length))
      .fill(null)
      .map(async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (item) {
            await taskFn(item);
          }
        }
      });
    await Promise.all(workers);
  }
}

export const cityExplorerPrefetchService = new CityExplorerPrefetchService();
