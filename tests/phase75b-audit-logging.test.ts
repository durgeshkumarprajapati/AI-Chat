import { auditService } from '@/features/audit/audit.service';

describe('Phase 75B — Configuration Audit Logging Hardening', () => {
  it('logs configuration updates with version numbers and redacts secrets', async () => {
    const details = {
      key: 'RAG_RERANK_TIMEOUT_MS',
      previousValue: '15000',
      newValue: '12000',
      version: 2,
      secretPayload: 'sk-secret-key'
    };

    const sanitized = auditService.sanitizeMetadata(details) as any;
    expect(sanitized.key).toBe('RAG_RERANK_TIMEOUT_MS');
    expect(sanitized.version).toBe(2);
    expect(sanitized.secretPayload).toBe('[REDACTED]');
  });
});
