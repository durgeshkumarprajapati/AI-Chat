import { configService } from '@/features/config/config.service';

describe('Phase 75A — Worker Configuration Integration', () => {
  it('allows worker background processes to resolve non-secret settings from ConfigService', async () => {
    const ocrEnabled = await configService.getBoolean('OCR_ENABLED', true);
    expect(typeof ocrEnabled).toBe('boolean');

    const maxImages = await configService.getNumber('DOCUMENT_MAX_IMAGES_PER_DOCUMENT', 50);
    expect(maxImages).toBeGreaterThan(0);
  });
});
