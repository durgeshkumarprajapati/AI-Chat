import { sarvamClient } from '../sarvam.client';
import { LanguageDetectionResultDTO } from '../sarvam.types';

export class LanguageDetectionService {
  /**
   * Fast script-based detection for Indic Unicode ranges:
   * Devanagari: \u0900-\u097F (Hindi, Marathi)
   * Bengali: \u0980-\u09FF (Bengali)
   * Gurmukhi: \u0A00-\u0A7F (Punjabi)
   * Gujarati: \u0A80-\u0AFF (Gujarati)
   * Oriya: \u0B00-\u0B7F (Odia)
   * Tamil: \u0B80-\u0BFF (Tamil)
   * Telugu: \u0C00-\u0C7F (Telugu)
   * Kannada: \u0C80-\u0CFF (Kannada)
   * Malayalam: \u0D00-\u0D7F (Malayalam)
   */
  public detectScript(text: string): LanguageDetectionResultDTO {
    if (!text || text.trim().length === 0) {
      return { language: 'en-IN', isIndic: false, confidence: 1.0 };
    }

    if (/[\u0900-\u097F]/.test(text)) {
      return { language: 'hi-IN', isIndic: true, confidence: 0.95 };
    }
    if (/[\u0980-\u09FF]/.test(text)) {
      return { language: 'bn-IN', isIndic: true, confidence: 0.95 };
    }
    if (/[\u0A80-\u0AFF]/.test(text)) {
      return { language: 'gu-IN', isIndic: true, confidence: 0.95 };
    }
    if (/[\u0B80-\u0BFF]/.test(text)) {
      return { language: 'ta-IN', isIndic: true, confidence: 0.95 };
    }
    if (/[\u0C00-\u0C7F]/.test(text)) {
      return { language: 'te-IN', isIndic: true, confidence: 0.95 };
    }
    if (/[\u0C80-\u0CFF]/.test(text)) {
      return { language: 'kn-IN', isIndic: true, confidence: 0.95 };
    }
    if (/[\u0D00-\u0D7F]/.test(text)) {
      return { language: 'ml-IN', isIndic: true, confidence: 0.95 };
    }
    if (/[\u0A00-\u0A7F]/.test(text)) {
      return { language: 'pa-IN', isIndic: true, confidence: 0.95 };
    }
    if (/[\u0B00-\u0B7F]/.test(text)) {
      return { language: 'or-IN', isIndic: true, confidence: 0.95 };
    }

    return { language: 'en-IN', isIndic: false, confidence: 1.0 };
  }

  public async detectLanguage(text: string): Promise<LanguageDetectionResultDTO> {
    // 1. Try instant Unicode script detection
    const scriptResult = this.detectScript(text);
    if (scriptResult.isIndic) {
      return scriptResult;
    }

    // 2. Call Sarvam language detection API if configured
    if (sarvamClient.isConfigured()) {
      try {
        const res = await sarvamClient.detectLanguage(text, 3000);
        const isIndic = res.language_code !== 'en-IN' && res.language_code !== 'en';
        return {
          language: res.language_code,
          isIndic,
          confidence: res.confidence || 0.8
        };
      } catch {
        // Fall back to script result
      }
    }

    return scriptResult;
  }
}

export const languageDetectionService = new LanguageDetectionService();
