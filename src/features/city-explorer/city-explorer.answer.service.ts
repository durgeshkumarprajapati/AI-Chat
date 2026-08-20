import { PredefinedQuestionItem, CityInfo, CityExplorerAnswerResult } from './city-explorer.types';
import { CityExplorerAnswerProvider } from './providers/city-explorer-answer-provider.interface';
import { WeatherCityAnswerProvider, weatherCityAnswerProvider } from './providers/weather-city-answer.provider';
import { geminiCityAnswerProvider } from './providers/gemini-city-answer.provider';
import { WebSearchCityAnswerProvider, webSearchCityAnswerProvider } from './providers/web-search-city-answer.provider';
import { cityExplorerTelemetryService } from './city-explorer.telemetry.service';
import { env } from '@/config/env';

export class CityExplorerAnswerService {
  private providers: CityExplorerAnswerProvider[];

  constructor(_providers?: CityExplorerAnswerProvider[]);
  constructor(_webSearch?: any, _weather?: any, _llmProvider?: any);
  constructor(
    arg1?: any,
    weather?: any,
    _llmProvider?: any
  ) {
    if (Array.isArray(arg1)) {
      this.providers = arg1;
    } else if (arg1 || weather) {
      const wProvider = weather ? new WeatherCityAnswerProvider(weather) : weatherCityAnswerProvider;
      const wsProvider = arg1 ? new WebSearchCityAnswerProvider(arg1) : webSearchCityAnswerProvider;
      this.providers = [wProvider, geminiCityAnswerProvider, wsProvider];
    } else {
      this.providers = [
        weatherCityAnswerProvider,
        geminiCityAnswerProvider,
        webSearchCityAnswerProvider
      ];
    }
  }

  /**
   * Generates a grounded answer for a single city explorer question using provider strategy chain
   * (Weather -> Gemini Web Grounding -> WebSearch Fallback).
   * Enforces strict source isolation (sourceMode = "WEB_PUBLIC") so private documents are never touched.
   */
  public async generateAnswer(
    userId: string,
    city: CityInfo,
    questionItem: PredefinedQuestionItem,
    signal?: AbortSignal,
    context?: { text: string; source?: string }[]
  ): Promise<CityExplorerAnswerResult> {
    const startTime = Date.now();
    const cityStr = city.name.trim();

    // 1. Weather Provider Check
    if (questionItem.isWeather) {
      const weatherProvider = this.providers.find((p) => p.name === 'WEATHER');
      if (weatherProvider) {
        return weatherProvider.generateAnswer(userId, city, questionItem, signal);
      }
    }

    // 2. Gemini Web Grounding Provider Check
    const isV2Enabled = env.server?.CITY_EXPLORER_V2_ENABLED ?? true;
    if (isV2Enabled) {
      const geminiProvider = this.providers.find((p) => p.name === 'GEMINI');
      if (geminiProvider && geminiProvider.supports(questionItem)) {
        try {
          const res = await (geminiProvider as any).generateAnswer(userId, city, questionItem, signal, context);
          return res;
        } catch (err: any) {
          console.warn(`[CityExplorerAnswerService] Gemini provider failed for ${questionItem.id}, attempting WebSearch fallback:`, err?.message || String(err));
          cityExplorerTelemetryService.logEvent('explore.ai.fallback', cityStr, questionItem.id, userId, {
            primaryProvider: 'GEMINI',
            fallbackProvider: 'WEB_SEARCH',
            reason: err?.message || String(err)
          });
        }
      }
    }

    // 3. WebSearch Fallback Provider
    const webSearchProvider = this.providers.find((p) => p.name === 'WEB_SEARCH');
    if (webSearchProvider && webSearchProvider.supports(questionItem)) {
      try {
        const res = await webSearchProvider.generateAnswer(userId, city, questionItem, signal);
        return res;
      } catch (err: any) {
        console.error(`[CityExplorerAnswerService] WebSearch fallback provider failed for ${questionItem.id}:`, err);
      }
    }

    // 4. Final Fail-Safe Response
    return {
      questionId: questionItem.id,
      category: questionItem.category,
      question: questionItem.question,
      status: 'UNAVAILABLE',
      error: 'This city information is temporarily unavailable.',
      cached: false,
      durationMs: Date.now() - startTime,
      generatedAt: new Date().toISOString()
    };
  }
}

export const cityExplorerAnswerService = new CityExplorerAnswerService();
