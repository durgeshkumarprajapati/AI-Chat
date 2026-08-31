import { sarvamDocumentTranslationService } from '@/features/sarvam/translation/sarvam-document-translation.service';

describe('Phase 79 — Sarvam Document Translation Asynchronous Workflows', () => {
  it('throws error when requesting document translation while features are disabled', async () => {
    await expect(
      sarvamDocumentTranslationService.requestDocumentTranslation({
        documentId: 'non-existent-doc',
        userId: 'user-123',
        targetLanguages: ['hi-IN']
      })
    ).rejects.toThrow('Sarvam Document Translation is currently disabled in Admin Configuration.');
  });
});
