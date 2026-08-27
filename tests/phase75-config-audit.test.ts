import { auditService } from '@/features/audit/audit.service';

describe('Phase 75 — Configuration Audit Logging', () => {
  it('sanitizes metadata and records config events cleanly', async () => {
    const opts = {
      actorId: 'admin-user-1',
      action: 'CONFIG_UPDATED',
      targetType: 'CONFIG',
      targetId: 'cfg-100',
      details: {
        key: 'RAG_FAST_PATH_CONFIDENCE_THRESHOLD',
        previousValue: '0.90',
        newValue: '0.85',
        secretKeyMock: 'supersecret'
      }
    };

    const sanitized = auditService.sanitizeMetadata(opts.details) as any;
    expect(sanitized.key).toBe('RAG_FAST_PATH_CONFIDENCE_THRESHOLD');
    expect(sanitized.secretKeyMock).toBe('[REDACTED]');
  });
});
