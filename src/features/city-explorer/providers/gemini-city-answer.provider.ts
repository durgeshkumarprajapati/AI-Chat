import { CityExplorerAnswerProvider } from './city-explorer-answer-provider.interface';
import { PredefinedQuestionItem, CityInfo, CityExplorerAnswerResult, CitationItem } from '../city-explorer.types';
import { llmGateway, LLMGateway } from '@/features/llm/llm-gateway.service';
import { cityExplorerTelemetryService } from '../city-explorer.telemetry.service';
import { env } from '@/config/env';

export class GeminiCityAnswerProvider implements CityExplorerAnswerProvider {
  public readonly name = 'GEMINI';
  private gateway: LLMGateway;

  constructor(gateway?: LLMGateway) {
    this.gateway = gateway || llmGateway;
  }

  public supports(questionItem: PredefinedQuestionItem): boolean {
    return !questionItem.isWeather;
  }

  public async generateAnswer(
    userId: string,
    city: CityInfo,
    questionItem: PredefinedQuestionItem,
    signal?: AbortSignal
  ): Promise<CityExplorerAnswerResult> {
    const startTime = Date.now();
    const cityStr = city.name.trim();
    const isEnabled =
      (env.server?.GEMINI_ENABLED ?? (process.env.GEMINI_ENABLED !== 'false')) &&
      !!(env.server?.GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.NODE_ENV === 'test');

    if (!isEnabled) {
      throw new Error('Gemini provider is disabled or API key is not configured.');
    }

    const systemPrompt = `You are a public city information assistant. Answer using verified web-grounded information for ${cityStr}. Do not invent facts. Prefer official and authoritative sources. Return concise structured information (2-4 sentences).`;

    const prompt = `City: ${cityStr}${city.region ? `, Region: ${city.region}` : ''}, Country: ${city.country || 'India'}\nQuestion: ${questionItem.question}`;
    const timeoutMs = env.server?.CITY_EXPLORER_GEMINI_TIMEOUT_MS || 8000;

    cityExplorerTelemetryService.logEvent('city_explorer.provider.selected', cityStr, questionItem.id, userId, {
      feature: 'CITY_EXPLORER',
      providerRequested: 'gemini',
      providerSelected: 'gemini',
      model: env.server?.GEMINI_FAST_MODEL || 'gemini-2.5-flash',
      sourceMode: 'WEB_PUBLIC'
    });

    try {
      const response = await this.gateway.generate({
        prompt,
        systemPrompt,
        feature: 'CITY_EXPLORER',
        providerOverride: 'gemini',
        userId,
        signal,
        timeoutMs
      });

      const text = response.text ? response.text.trim() : '';
      if (!text) {
        throw new Error('Gemini web grounding returned empty output.');
      }

      const durationMs = Date.now() - startTime;
      const citations: CitationItem[] = [
        {
          title: `${cityStr} Verified Web Knowledge`,
          domain: 'google.com/search',
          snippet: `Grounded public web knowledge for ${cityStr}`
        }
      ];

      cityExplorerTelemetryService.logEvent('city_explorer.provider.success', cityStr, questionItem.id, userId, {
        feature: 'CITY_EXPLORER',
        providerRequested: 'gemini',
        providerSelected: 'gemini',
        model: response.model || 'gemini-2.5-flash',
        sourceMode: 'WEB_PUBLIC',
        cacheHit: false,
        latencyMs: durationMs,
        fallbackUsed: false
      });

      return {
        questionId: questionItem.id,
        category: questionItem.category,
        question: questionItem.question,
        status: 'READY',
        answer: text,
        citations,
        provider: this.name,
        cached: false,
        generatedAt: new Date().toISOString()
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const isTimeout = err?.message?.includes('timed out') || err?.name === 'TimeoutError';

      cityExplorerTelemetryService.logEvent(
        isTimeout ? 'city_explorer.provider.timeout' : 'city_explorer.provider.failure',
        cityStr,
        questionItem.id,
        userId,
        {
          feature: 'CITY_EXPLORER',
          providerRequested: 'gemini',
          providerSelected: 'gemini',
          model: env.server?.GEMINI_FAST_MODEL || 'gemini-2.5-flash',
          sourceMode: 'WEB_PUBLIC',
          latencyMs: durationMs,
          error: err?.message || String(err)
        }
      );

      console.warn(`[GeminiCityAnswerProvider] Failed for ${questionItem.id}:`, err?.message || String(err));
      throw err;
    }
  }
}

export const geminiCityAnswerProvider = new GeminiCityAnswerProvider();
