import { PredefinedQuestionItem, CityInfo, CityExplorerAnswerResult, CitationItem } from './city-explorer.types';
import { webSearchService, WebSearchService } from '@/features/rag/web-search/web-search.service';
import { weatherService, WeatherService } from '@/features/weather/weather.service';
import { getLLMProvider } from '@/features/rag/llm/llm.provider.factory';
import { cityExplorerTelemetryService } from './city-explorer.telemetry.service';

import { LLMProvider } from '@/features/rag/llm/llm.provider';

export class CityExplorerAnswerService {
  private webSearch: WebSearchService;
  private weather: WeatherService;
  public llmProvider?: LLMProvider;

  constructor(webSearch?: WebSearchService, weather?: WeatherService, llmProvider?: LLMProvider) {
    this.webSearch = webSearch || webSearchService;
    this.weather = weather || weatherService;
    this.llmProvider = llmProvider;
  }

  /**
   * Generates a grounded answer for a single city explorer question using web search or weather service.
   * Enforces strict source isolation (sourceMode = "web_search") so private documents are never touched.
   */
  public async generateAnswer(
    userId: string,
    city: CityInfo,
    questionItem: PredefinedQuestionItem
  ): Promise<CityExplorerAnswerResult> {
    const startTime = Date.now();
    const cityStr = city.name.trim();

    // 1. Weather Category Special Handling
    if (questionItem.isWeather) {
      try {
        const weatherData = await this.weather.getWeather(cityStr);
        const answer = `Current weather in ${weatherData.city}: ${weatherData.temperature}°C (Feels like ${weatherData.feelsLike}°C), ${weatherData.condition}. High of ${weatherData.high}°C, Low of ${weatherData.low}°C. Humidity: ${weatherData.humidity}%, Wind: ${weatherData.windSpeed} km/h. Best visited during mild winter and spring months.`;
        
        cityExplorerTelemetryService.logEvent('city_explorer.answer.generated', cityStr, questionItem.id, userId, {
          isWeather: true,
          durationMs: Date.now() - startTime
        });

        return {
          questionId: questionItem.id,
          category: questionItem.category,
          question: questionItem.question,
          status: 'READY',
          answer,
          citations: [{ title: 'Open-Meteo Weather Service', domain: 'open-meteo.com' }],
          cached: false,
          generatedAt: new Date().toISOString()
        };
      } catch (err) {
        console.warn(`[CityExplorerAnswerService] Weather lookup failed for ${cityStr}:`, err);
      }
    }

    // 2. Web Search Pipeline (Grounded Public Knowledge)
    try {
      const searchRes = await this.webSearch.executeWebSearch(userId, questionItem.question);
      const chunks = searchRes.chunks || [];

      if (chunks.length === 0) {
        cityExplorerTelemetryService.logEvent('city_explorer.answer.no_evidence', cityStr, questionItem.id, userId);
        return {
          questionId: questionItem.id,
          category: questionItem.category,
          question: questionItem.question,
          status: 'NO_EVIDENCE',
          answer: 'Reliable information could not be found for this question.',
          citations: [],
          cached: false,
          generatedAt: new Date().toISOString()
        };
      }

      // Build citations list safely
      const citations: CitationItem[] = [];
      const seenUrls = new Set<string>();

      const contextLines = chunks.map((c, i) => {
        const titleStr = typeof c.metadata?.title === 'string' ? c.metadata.title : `Web Source ${i + 1}`;
        const urlStr = typeof c.metadata?.url === 'string' ? c.metadata.url : '';
        let domainStr = typeof c.metadata?.domain === 'string' ? c.metadata.domain : 'web';
        
        if (urlStr && domainStr === 'web') {
          try {
            domainStr = new URL(urlStr).hostname;
          } catch {}
        }

        if (urlStr && !seenUrls.has(urlStr)) {
          seenUrls.add(urlStr);
          citations.push({
            title: titleStr,
            url: urlStr,
            domain: domainStr,
            snippet: c.content.substring(0, 150)
          });
        }
        return `[Source ${i + 1}] (${titleStr} - ${domainStr}): ${c.content}`;
      });

      // Construct grounded prompt with injection protection
      const prompt = `<USER_REQUEST>
${questionItem.question}
</USER_REQUEST>

<CITY_CONTEXT>
City: ${cityStr}
Region: ${city.region || 'N/A'}
Country: ${city.country || 'India'}
</CITY_CONTEXT>

<UNTRUSTED_WEB_EVIDENCE>
${contextLines.join('\n\n')}
</UNTRUSTED_WEB_EVIDENCE>

Instruction: Synthesize a concise, well-structured, grounded answer (2-4 sentences) answering the user question specifically for ${cityStr} using ONLY the provided web evidence. Do not include unverified claims. Output clear markdown text.`;

      const llm = this.llmProvider || getLLMProvider();
      const answerRaw = await llm.generateAnswer({
        question: prompt,
        context: 'You are an authoritative City Knowledge Explorer assistant. Provide grounded, concise, fact-checked responses.'
      });

      const answer = answerRaw ? answerRaw.trim() : 'Information unavailable.';

      cityExplorerTelemetryService.logEvent('city_explorer.answer.generated', cityStr, questionItem.id, userId, {
        citationCount: citations.length,
        durationMs: Date.now() - startTime
      });

      return {
        questionId: questionItem.id,
        category: questionItem.category,
        question: questionItem.question,
        status: 'READY',
        answer,
        citations,
        cached: false,
        generatedAt: new Date().toISOString()
      };
    } catch (err) {
      console.error(`[CityExplorerAnswerService] Answer generation failed for ${questionItem.id}:`, err);
      cityExplorerTelemetryService.logEvent('city_explorer.answer.failed', cityStr, questionItem.id, userId, {
        error: err instanceof Error ? err.message : String(err)
      });

      return {
        questionId: questionItem.id,
        category: questionItem.category,
        question: questionItem.question,
        status: 'FAILED',
        error: 'Unable to load this answer right now.',
        cached: false,
        generatedAt: new Date().toISOString()
      };
    }
  }
}

export const cityExplorerAnswerService = new CityExplorerAnswerService();
