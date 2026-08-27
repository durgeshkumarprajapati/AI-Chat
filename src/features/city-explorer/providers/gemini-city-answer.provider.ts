import { CityExplorerAnswerProvider } from './city-explorer-answer-provider.interface';
import { PredefinedQuestionItem, CityInfo, CityExplorerAnswerResult, CitationItem, ExploreAnswerSchema } from '../city-explorer.types';
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
    signal?: AbortSignal,
    context?: { text: string; source?: string }[]
  ): Promise<CityExplorerAnswerResult> {
    const startTime = Date.now();
    const cityStr = city.name.trim();
    const isEnabled =
      (env.server?.GEMINI_ENABLED ?? (process.env.GEMINI_ENABLED !== 'false')) &&
      !!(env.server?.GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.NODE_ENV === 'test');

    if (!isEnabled) {
      throw new Error('Gemini provider is disabled or API key is not configured.');
    }

    const systemPrompt = `You are the AI assistant for Document AI City Explorer.

Answer the user's city/travel question clearly and concisely.

City:
${cityStr}${city.region ? `, Region: ${city.region}` : ''}${city.country ? `, Country: ${city.country}` : ''}

Category:
${questionItem.category}

Question:
${questionItem.question}

Rules:
- Answer specifically about the requested city.
- Do not invent businesses, addresses, phone numbers, prices, opening hours, or other precise facts.
- If information is uncertain, explicitly say so.
- Prefer concise factual answers.
- Do not mention that you are an AI unless necessary.
- Do not return markdown unless requested.
- Do not include unsupported citations.
- Return the response using JSON format matching schema: {"answer": "string", "confidence": "high"|"medium"|"low", "highlights": ["string"]}.`;

    let prompt = `City: ${cityStr}${city.region ? `, Region: ${city.region}` : ''}, Country: ${city.country || 'India'}\nQuestion: ${questionItem.question}`;
    
    if (context && context.length > 0) {
      const contextText = context.map((c) => c.text).join('\n---\n');
      prompt += `\n\nRetrieved Context:\n${contextText}`;
    }

    const timeoutMs = env.server?.CITY_EXPLORER_GEMINI_TIMEOUT_MS || 30000;

    cityExplorerTelemetryService.logEvent('explore.ai.generation.started', cityStr, questionItem.id, userId, {
      feature: 'CITY_EXPLORER',
      providerRequested: 'gemini',
      providerSelected: 'gemini',
      model: env.server?.GEMINI_FAST_MODEL || 'gemini-3.6-flash',
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

      const rawText = response.text ? response.text.trim() : '';
      if (!rawText) {
        throw new Error('Gemini returned empty output.');
      }

      // Strip markdown code fences if present
      const cleanedJson = rawText
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/i, '')
        .trim();

      let answerText = rawText;
      let confidence: 'high' | 'medium' | 'low' = 'medium';
      let highlights: string[] | undefined = undefined;

      try {
        const parsedObj = JSON.parse(cleanedJson);
        const validated = ExploreAnswerSchema.safeParse(parsedObj);
        if (validated.success) {
          answerText = validated.data.answer;
          confidence = validated.data.confidence;
          highlights = validated.data.highlights;
        } else {
          cityExplorerTelemetryService.logEvent('explore.ai.validation.failed', cityStr, questionItem.id, userId, {
            error: validated.error.message,
            rawText
          });
          // Fallback to text if answer property exists in raw JSON object
          if (typeof parsedObj?.answer === 'string') {
            answerText = parsedObj.answer;
          }
        }
      } catch {
        cityExplorerTelemetryService.logEvent('explore.ai.validation.failed', cityStr, questionItem.id, userId, {
          reason: 'JSON parsing failed, falling back to raw text',
          rawText
        });
      }

      const durationMs = Date.now() - startTime;
      const citations: CitationItem[] = [
        {
          title: `${cityStr} AI Grounded Insight`,
          domain: 'gemini.google.com',
          snippet: `AI Generated information for ${cityStr}`
        }
      ];

      cityExplorerTelemetryService.logEvent('explore.ai.generation.completed', cityStr, questionItem.id, userId, {
        feature: 'CITY_EXPLORER',
        providerRequested: 'gemini',
        providerSelected: 'gemini',
        model: response.model || 'gemini-2.5-flash',
        sourceMode: 'WEB_PUBLIC',
        cacheHit: false,
        latencyMs: durationMs,
        confidence
      });

      return {
        questionId: questionItem.id,
        category: questionItem.category,
        question: questionItem.question,
        status: 'READY',
        answer: answerText,
        confidence,
        highlights,
        citations,
        provider: this.name,
        cached: false,
        generatedAt: new Date().toISOString()
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const isTimeout = err?.message?.includes('timed out') || err?.name === 'TimeoutError';

      cityExplorerTelemetryService.logEvent(
        isTimeout ? 'city_explorer.provider.timeout' : 'explore.ai.generation.failed',
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
