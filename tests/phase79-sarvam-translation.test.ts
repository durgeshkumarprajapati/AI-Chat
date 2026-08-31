import { sarvamTextTranslationService } from '@/features/sarvam/translation/sarvam-text-translation.service';

describe('Phase 79 — Sarvam Real-Time Text Translation', () => {
  it('passes through text unchanged when translation is disabled', async () => {
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
