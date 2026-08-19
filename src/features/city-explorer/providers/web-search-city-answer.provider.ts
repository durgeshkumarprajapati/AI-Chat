import { CityExplorerAnswerProvider } from './city-explorer-answer-provider.interface';
import { PredefinedQuestionItem, CityInfo, CityExplorerAnswerResult, CitationItem } from '../city-explorer.types';
import { webSearchService, WebSearchService } from '@/features/rag/web-search/web-search.service';
import { llmGateway, LLMGateway } from '@/features/llm/llm-gateway.service';
import { cityExplorerTelemetryService } from '../city-explorer.telemetry.service';
import { env } from '@/config/env';

export class WebSearchCityAnswerProvider implements CityExplorerAnswerProvider {
  public readonly name = 'WEB_SEARCH';
  private webSearch: WebSearchService;
  private gateway: LLMGateway;

  constructor(webSearch?: WebSearchService, gateway?: LLMGateway) {
    this.webSearch = webSearch || webSearchService;
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
    const maxFetches = env.server?.CITY_EXPLORER_MAX_SOURCE_FETCHES ?? 3;

    try {
      const searchRes = await this.webSearch.executeWebSearch(userId, questionItem.question);
      const allChunks = searchRes.chunks || [];
      const chunks = allChunks.slice(0, maxFetches);

      if (chunks.length === 0) {
        cityExplorerTelemetryService.logEvent('city_explorer.answer.no_evidence', cityStr, questionItem.id, userId, {
          provider: this.name,
          reason: 'All web sources failed or returned empty results'
        });

        return {
          questionId: questionItem.id,
          category: questionItem.category,
          question: questionItem.question,
          status: 'NO_EVIDENCE',
          answer: 'NO_GROUNDED_CITY_ANSWER',
          citations: [],
          provider: this.name,
          cached: false,
          generatedAt: new Date().toISOString()
        };
      }

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

Instruction: Synthesize a concise, well-structured, grounded answer (2-4 sentences) answering the user question specifically for ${cityStr} using ONLY the provided web evidence. Do not include unverified claims.`;

      let answer = 'NO_GROUNDED_CITY_ANSWER';
      try {
        const response = await this.gateway.generate({
          prompt,
          systemPrompt: 'You are an authoritative City Knowledge Explorer assistant. Synthesize grounded web answers concisely (2-4 sentences). Do not invent facts.',
          feature: 'CITY_EXPLORER',
          providerOverride: 'gemini',
          userId,
          signal,
          timeoutMs: env.server?.CITY_EXPLORER_WEBSEARCH_TIMEOUT_MS || 5000
        });
        if (response.text && response.text.trim()) {
          answer = response.text.trim();
        }
      } catch (synthErr: any) {
        console.warn(`[WebSearchCityAnswerProvider] Gemini evidence synthesis failed:`, synthErr?.message || String(synthErr));
      }

      cityExplorerTelemetryService.logEvent('city_explorer.answer.generated', cityStr, questionItem.id, userId, {
        provider: this.name,
        citationCount: citations.length,
        durationMs: Date.now() - startTime
      });

      return {
        questionId: questionItem.id,
        category: questionItem.category,
        question: questionItem.question,
        status: answer === 'NO_GROUNDED_CITY_ANSWER' ? 'NO_EVIDENCE' : 'READY',
        answer,
        citations,
        provider: this.name,
        cached: false,
        generatedAt: new Date().toISOString()
      };
    } catch (err: any) {
      console.warn(`[WebSearchCityAnswerProvider] Search fallback failed for ${questionItem.id}:`, err?.message || String(err));

      cityExplorerTelemetryService.logEvent('city_explorer.answer.failed', cityStr, questionItem.id, userId, {
        provider: this.name,
        error: err?.message || String(err)
      });

      return {
        questionId: questionItem.id,
        category: questionItem.category,
        question: questionItem.question,
        status: 'FAILED',
        error: 'Unable to load this answer right now.',
        provider: this.name,
        cached: false,
        generatedAt: new Date().toISOString()
      };
    }
  }
}

export const webSearchCityAnswerProvider = new WebSearchCityAnswerProvider();
