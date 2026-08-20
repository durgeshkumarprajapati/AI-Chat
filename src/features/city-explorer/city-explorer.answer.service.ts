import { PredefinedQuestionItem, CityInfo, CityExplorerAnswerResult } from './city-explorer.types';
import { CityExplorerAnswerProvider } from './providers/city-explorer-answer-provider.interface';
import { WeatherCityAnswerProvider, weatherCityAnswerProvider } from './providers/weather-city-answer.provider';
import { geminiCityAnswerProvider } from './providers/gemini-city-answer.provider';
import { cityExplorerTelemetryService } from './city-explorer.telemetry.service';

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
      this.providers = [wProvider, geminiCityAnswerProvider];
    } else {
      this.providers = [
        weatherCityAnswerProvider,
        geminiCityAnswerProvider
      ];
    }
  }

  /**
   * Generates an AI answer exclusively using Gemini for city explorer questions
   * (or Weather for weather queries).
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

    // 2. Gemini Provider Check (Gemini Only)
    const geminiProvider = this.providers.find((p) => p.name === 'GEMINI') || geminiCityAnswerProvider;
    if (geminiProvider && geminiProvider.supports(questionItem)) {
      try {
        const res = await (geminiProvider as any).generateAnswer(userId, city, questionItem, signal, context);
        return res;
      } catch (err: any) {
        console.error(`[CityExplorerAnswerService] Gemini provider failed for ${questionItem.id}:`, err?.message || String(err));
        cityExplorerTelemetryService.logEvent('explore.ai.generation.failed', cityStr, questionItem.id, userId, {
          provider: 'GEMINI',
          reason: err?.message || String(err)
        });
      }
    }

    // 3. Final Fail-Safe Response if Gemini fails
    return {
      questionId: questionItem.id,
      category: questionItem.category,
      question: questionItem.question,
      status: 'FAILED',
      error: 'AI answer is temporarily unavailable.',
      cached: false,
      durationMs: Date.now() - startTime,
      generatedAt: new Date().toISOString()
    };
  }
}

export const cityExplorerAnswerService = new CityExplorerAnswerService();
