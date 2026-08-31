import { classifySarvamError } from '@/features/sarvam/sarvam-error.classifier';
import { sarvamProviderService } from '@/features/sarvam/sarvam-provider.service';

describe('Phase 79 — Sarvam Provider & Error Classification', () => {
  it('classifies 403 authorization error', () => {
    const classified = classifySarvamError(new Error('Sarvam translate HTTP 403: Invalid api-subscription-key'));
    expect(classified.category).toBe('UNAUTHORIZED');
    expect(classified.isRetryable).toBe(false);
  });

  it('classifies 429 rate limit error as retryable', () => {
    const classified = classifySarvamError(new Error('Sarvam translate HTTP 429: Too Many Requests'));
    expect(classified.category).toBe('RATE_LIMIT');
    expect(classified.isRetryable).toBe(true);
  });

  it('classifies timeout error as retryable', () => {
    const classified = classifySarvamError(new Error('The operation was aborted due to timeout'));
    expect(classified.category).toBe('TIMEOUT');
    expect(classified.isRetryable).toBe(true);
  });

  it('returns provider status correctly without breaking when key is absent', async () => {
    const status = await sarvamProviderService.getStatus();
    expect(status).toHaveProperty('isConfigured');
    expect(status).toHaveProperty('enabled');
    expect(status).toHaveProperty('digitisationEnabled');
    expect(status).toHaveProperty('translationEnabled');
  });

  it('exposes job digitisation API helper methods on sarvamClient', () => {
    const { sarvamClient } = require('@/features/sarvam/sarvam.client');
    expect(typeof sarvamClient.createDigitisationJob).toBe('function');
    expect(typeof sarvamClient.getDigitisationJobStatus).toBe('function');
    expect(typeof sarvamClient.getDigitisationJobDownloadUrl).toBe('function');
  });
});
