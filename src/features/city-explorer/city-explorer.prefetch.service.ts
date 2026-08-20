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
import { runWithConcurrencyLimit } from '@/lib/performance/concurrency';

export class CityExplorerPrefetchService {
  private cache: CityExplorerCacheService;
  private answerService: CityExplorerAnswerService;
  private inFlightMap: Map<string, Promise<CityExplorerAnswerResult>> = new Map();

  constructor(cache?: CityExplorerCacheService, answerService?: CityExplorerAnswerService) {
    this.cache = cache || cityExplorerCacheService;
    this.answerService = answerService || cityExplorerAnswerService;
  }

  /**
   * Main prefetch entry point. Validates city & questions, executes cache lookups,
   * schedules missing answer generations with tiered priority (P0 -> P1 -> P2),
   * bounded concurrency control, and request deduplication.
   */
  public async prefetchAnswers(
    userId: string,
    input: PrefetchRequestInput,
    signal?: AbortSignal
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

    const resultsMap: Map<string, CityExplorerAnswerResult> = new Map();
    const missingQuestions: PredefinedQuestionItem[] = [];

    // 1. Instant Cache Check Phase
    for (const qItem of targetQuestions) {
      const isForceRefresh = input.forceRefreshQuestionId === qItem.id;

      if (!isForceRefresh) {
        const cachedEntry = await this.cache.getCachedAnswer(rawCity, qItem.id);
        if (cachedEntry && cachedEntry.result) {
          resultsMap.set(qItem.id, cachedEntry.result);
          cityExplorerTelemetryService.logEvent('explore.ai.cache.hit', rawCity, qItem.id, userId);
          cityExplorerTelemetryService.logEvent('city_explorer.answer.cache_hit', rawCity, qItem.id, userId);
          continue;
        }
      } else {
        cityExplorerTelemetryService.logEvent('explore.ai.answer.refreshed', rawCity, qItem.id, userId);
      }

      cityExplorerTelemetryService.logEvent('explore.ai.cache.miss', rawCity, qItem.id, userId, {
        isForceRefresh
      });
      cityExplorerTelemetryService.logEvent('city_explorer.answer.cache_miss', rawCity, qItem.id, userId, {
        isForceRefresh
      });
      missingQuestions.push(qItem);
    }

    // 2. Priority Grouping (P0 -> P1 -> P2) for Missing Answers
    if (missingQuestions.length > 0) {
      const p0Items = missingQuestions.filter((q) => q.priority === 'P0');
      const p1Items = missingQuestions.filter((q) => q.priority === 'P1');
      const p2Items = missingQuestions.filter((q) => q.priority === 'P2');

      const maxConcurrency = env.server?.CITY_EXPLORER_MAX_CONCURRENCY ?? 3;

      for (const tierItems of [p0Items, p1Items, p2Items]) {
        if (tierItems.length === 0) continue;

        await runWithConcurrencyLimit(
          tierItems,
          maxConcurrency,
          async (qItem) => {
            const inFlightKey = `${rawCity.toLowerCase()}:${qItem.id}`;
            const existingPromise = this.inFlightMap.get(inFlightKey);

            if (existingPromise) {
              const deduplicatedRes = await existingPromise;
              resultsMap.set(qItem.id, deduplicatedRes);
              return;
            }

            const taskPromise = (async (): Promise<CityExplorerAnswerResult> => {
              const lockOwner = await this.cache.acquireGenerationLock(rawCity, qItem.id);

              try {
                if (!input.forceRefreshQuestionId || input.forceRefreshQuestionId !== qItem.id) {
                  const recheck = await this.cache.getCachedAnswer(rawCity, qItem.id);
                  if (recheck && recheck.result) {
                    return recheck.result;
                  }
                }

                const generated = await this.answerService.generateAnswer(userId, cityInfo, qItem, signal);

                if (generated.status === 'READY' || generated.status === 'NO_EVIDENCE') {
                  await this.cache.setCachedAnswer(rawCity, qItem.id, generated, qItem.kind);
                }

                return generated;
              } finally {
                if (lockOwner) {
                  await this.cache.releaseGenerationLock(rawCity, qItem.id, lockOwner);
                }
              }
            })();

            this.inFlightMap.set(inFlightKey, taskPromise);

            try {
              const res = await taskPromise;
              resultsMap.set(qItem.id, res);
            } catch (err) {
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
              this.inFlightMap.delete(inFlightKey);
            }
          },
          { signal, timeoutMs: env.server?.CITY_EXPLORER_GEMINI_TIMEOUT_MS || 30000 }
        );
      }
    }

    // Assemble final output array in exact registry order
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
}

export const cityExplorerPrefetchService = new CityExplorerPrefetchService();
