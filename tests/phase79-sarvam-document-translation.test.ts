import { sarvamDocumentTranslationService } from '@/features/sarvam/translation/sarvam-document-translation.service';
import { sarvamConfigService } from '@/features/sarvam/sarvam.config';

describe('Phase 79 — Sarvam Document Translation Asynchronous Workflows', () => {
  it('throws error when requesting document translation while features are disabled', async () => {
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
    await expect(
      sarvamDocumentTranslationService.requestDocumentTranslation({
        documentId: 'non-existent-doc',
        userId: 'user-123',
        targetLanguages: ['hi-IN']
      })
    ).rejects.toThrow('Sarvam Document Translation is currently disabled in Admin Configuration.');
  });
});
