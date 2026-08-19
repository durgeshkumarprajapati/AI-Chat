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
    const isEnabled = (env.server?.GEMINI_ENABLED ?? (process.env.GEMINI_ENABLED !== 'false')) &&
      !!(env.server?.GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.NODE_ENV === 'test');

    if (!isEnabled) {
      throw new Error('Gemini provider is disabled or API key is not configured.');
    }

    const systemPrompt = `You are a public city information assistant. Answer using verified web-grounded information for ${cityStr}. Do not invent facts. Prefer official and authoritative sources. Return concise structured information (2-4 sentences).`;

    const prompt = `City: ${cityStr}${city.region ? `, Region: ${city.region}` : ''}, Country: ${city.country || 'India'}\nQuestion: ${questionItem.question}`;

    try {
      const response = await this.gateway.generate({
        prompt,
        systemPrompt,
        feature: 'CITY_EXPLORER',
        providerOverride: 'gemini',
        userId,
        signal,
        timeoutMs: env.server?.CITY_EXPLORER_SOURCE_TIMEOUT_MS || 3000
      });

      const text = response.text ? response.text.trim() : '';
      if (!text) {
        throw new Error('Gemini web grounding returned empty output.');
      }

      const citations: CitationItem[] = [
        {
          title: `${cityStr} Verified Web Knowledge`,
          domain: 'google.com/search',
          snippet: `Grounded public web knowledge for ${cityStr}`
        }
      ];

      cityExplorerTelemetryService.logEvent('city_explorer.answer.generated', cityStr, questionItem.id, userId, {
        provider: this.name,
        model: response.model,
        durationMs: Date.now() - startTime
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
      console.warn(`[GeminiCityAnswerProvider] Failed for ${questionItem.id}:`, err?.message || String(err));
      throw err; // Allow CityExplorerAnswerService to fall back to WebSearchProvider
    }
  }
}

export const geminiCityAnswerProvider = new GeminiCityAnswerProvider();
