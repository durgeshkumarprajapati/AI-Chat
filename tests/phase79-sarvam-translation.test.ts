import { sarvamTextTranslationService } from '@/features/sarvam/translation/sarvam-text-translation.service';
import { sarvamConfigService } from '@/features/sarvam/sarvam.config';

describe('Phase 79 — Sarvam Real-Time Text Translation', () => {
  it('passes through text unchanged when translation is disabled', async () => {
    jest.spyOn(sarvamConfigService, 'getConfig').mockResolvedValueOnce({
      enabled: false,
      digitisationEnabled: false,
      translationEnabled: false,
      textTranslationEnabled: false,
      documentTranslationEnabled: false,
      multilingualRagEnabled: false,
      timeoutMs: 30000,
      maxDocumentSizeMb: 25,
      maxTranslationLanguages: 10,
      maxConcurrentJobs: 3,
      retryLimit: 3,
      pollIntervalMs: 2000,
      defaultSourceLanguage: 'hi-IN',
      defaultTranslationLanguage: 'en-IN',
      fallbackEnabled: true
    });
    const res = await sarvamTextTranslationService.translateText({
      text: 'Namaste World',
      sourceLanguage: 'hi-IN',
      targetLanguage: 'en-IN'
    });

    expect(res.translatedText).toBe('Namaste World');
    expect(res.sourceLanguage).toBe('hi-IN');
    expect(res.targetLanguage).toBe('en-IN');
  });
});
