import { createHash } from 'crypto';
import { redis } from '@/lib/redis';
import { sarvamClient } from '../sarvam.client';
import { sarvamConfigService } from '../sarvam.config';
import { sarvamTelemetryService } from '../telemetry/sarvam-telemetry.service';
import { TranslationRequestDTO, TranslationResponseDTO } from '../sarvam.types';

export class SarvamTextTranslationService {
  /**
   * Generates a secure Redis cache key using hashed text and tenant ID.
   */
  private getCacheKey(tenantId: string, sourceLang: string, targetLang: string, text: string): string {
    const textHash = createHash('sha256').update(text).digest('hex');
    return `sarvam:v1:translation:tenant:${tenantId}:source:${sourceLang}:target:${targetLang}:text:${textHash}`;
  }

  public async translateText(request: TranslationRequestDTO): Promise<TranslationResponseDTO> {
    const startTime = Date.now();
    const config = await sarvamConfigService.getConfig();
    const tenantId = request.userId || 'default-tenant';
    const sourceLang = request.sourceLanguage || config.defaultSourceLanguage;
    const targetLang = request.targetLanguage || config.defaultTranslationLanguage;

    sarvamTelemetryService.logEvent({
      event: 'sarvam.translation.started',
      tenantId,
      language: `${sourceLang}->${targetLang}`
    });

    if (!config.enabled || !config.translationEnabled || !sarvamClient.isConfigured()) {
      return {
        translatedText: request.text, // Passthrough if disabled
        sourceLanguage: sourceLang,
        targetLanguage: targetLang,
        provider: 'passthrough',
        cached: false,
        durationMs: Date.now() - startTime
      };
    }

    const cacheKey = this.getCacheKey(tenantId, sourceLang, targetLang, request.text);

    // 1. Try Redis Cache
    try {
      const cachedText = await redis.get(cacheKey);
      if (cachedText) {
        return {
          translatedText: cachedText,
          sourceLanguage: sourceLang,
          targetLanguage: targetLang,
          provider: 'sarvam-cache',
          cached: true,
          durationMs: Date.now() - startTime
        };
      }
    } catch {
      // Redis fallback
    }

    // 2. Execute Translation via Sarvam API
    try {
      const result = await sarvamClient.translateText(
        {
          input: request.text,
          source_language_code: sourceLang,
          target_language_code: targetLang
        },
        config.timeoutMs
      );

      const translatedText = result.translated_text || request.text;
      const durationMs = Date.now() - startTime;

      // Cache result for 24 hours (86400s)
      try {
        await redis.set(cacheKey, translatedText, 86400);
      } catch {
        // Non-blocking cache set error
      }

      sarvamTelemetryService.logEvent({
        event: 'sarvam.translation.completed',
        tenantId,
        durationMs,
        language: `${sourceLang}->${targetLang}`
      });

      return {
        translatedText,
        sourceLanguage: result.source_language_code || sourceLang,
        targetLanguage: targetLang,
        provider: 'sarvam',
        cached: false,
        durationMs
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - startTime;

      sarvamTelemetryService.logEvent({
        event: 'sarvam.translation.failed',
        tenantId,
        error: errMsg,
        durationMs
      });

      if (config.fallbackEnabled) {
        sarvamTelemetryService.logEvent({
          event: 'sarvam.fallback.used',
          tenantId,
          operation: 'translateText'
        });
        return {
          translatedText: request.text, // Passthrough fallback
          sourceLanguage: sourceLang,
          targetLanguage: targetLang,
          provider: 'fallback-passthrough',
          cached: false,
          durationMs
        };
      }

      throw err;
    }
  }
}

export const sarvamTextTranslationService = new SarvamTextTranslationService();
