import { sarvamConfigService } from '../sarvam.config';
import { languageDetectionService } from './language-detection.service';
import { sarvamTextTranslationService } from '../translation/sarvam-text-translation.service';
import { sarvamTelemetryService } from '../telemetry/sarvam-telemetry.service';

export interface MultilingualRagInput {
  query: string;
  tenantId?: string;
  generateAnswerFn: (_query: string) => Promise<string>;
}

export interface MultilingualRagResult {
  handled: boolean;
  answer?: string;
  queryLanguage?: string;
  originalAnswer?: string;
  translated?: boolean;
  durationMs?: number;
}

export class MultilingualAnswerService {
  public async processMultilingualRag(input: MultilingualRagInput): Promise<MultilingualRagResult> {
    const config = await sarvamConfigService.getConfig();

    // Zero latency impact for English queries or when Multilingual RAG is disabled
    if (!config.enabled || !config.multilingualRagEnabled) {
      return { handled: false };
    }

    const detection = languageDetectionService.detectScript(input.query);
    if (!detection.isIndic || detection.language === 'en-IN') {
      return { handled: false };
    }

    const startTime = Date.now();
    const queryLanguage = detection.language;

    sarvamTelemetryService.logEvent({
      event: 'sarvam.request.started',
      tenantId: input.tenantId,
      operation: 'multilingualRag',
      language: queryLanguage
    });

    try {
      // 1. Generate grounded answer via standard pipeline
      const englishAnswer = await input.generateAnswerFn(input.query);

      // 2. Translate answer back to target query language via Sarvam
      const translationResult = await sarvamTextTranslationService.translateText({
        text: englishAnswer,
        sourceLanguage: 'en-IN',
        targetLanguage: queryLanguage,
        userId: input.tenantId
      });

      const durationMs = Date.now() - startTime;

      sarvamTelemetryService.logEvent({
        event: 'sarvam.request.completed',
        tenantId: input.tenantId,
        operation: 'multilingualRag',
        durationMs,
        language: queryLanguage
      });

      return {
        handled: true,
        answer: translationResult.translatedText,
        originalAnswer: englishAnswer,
        queryLanguage,
        translated: true,
        durationMs
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      sarvamTelemetryService.logEvent({
        event: 'sarvam.request.failed',
        tenantId: input.tenantId,
        operation: 'multilingualRag',
        error: errMsg
      });

      // Fallback: Return standard answer unhandled if translation fails
      return { handled: false };
    }
  }
}

export const multilingualAnswerService = new MultilingualAnswerService();
