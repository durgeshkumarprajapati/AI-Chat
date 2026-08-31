import { sarvamDigitisationService } from '@/features/sarvam/digitisation/sarvam-digitisation.service';
import { sarvamOCRProvider } from '@/features/document-intelligence/multimodal/ocr/sarvam-ocr.provider';
import { ocrProviderRegistry } from '@/features/document-intelligence/multimodal/ocr/ocr-provider.registry';

describe('Phase 79 — Sarvam Document Digitisation & OCR Provider', () => {
  it('registers sarvam provider in ocrProviderRegistry', () => {
    const provider = ocrProviderRegistry.get('sarvam');
    expect(provider).toBeDefined();
    expect(provider.name).toBe('sarvam');
  });

  it('performs health check on sarvam OCR provider without throwing', async () => {
    const health = await sarvamOCRProvider.healthCheck();
    expect(health.name).toBe('sarvam');
    expect(['healthy', 'disabled']).toContain(health.status);
  });

  it('gracefully handles digitisation request when disabled or unconfigured', async () => {
    const res = await sarvamDigitisationService.digitiseDocument('doc-test-123', 'user-test-123', 'Sample text');
    expect(res.documentId).toBe('doc-test-123');
    expect(res.status).toBe('FAILED');
  });
});
