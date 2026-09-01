import { auditService } from '@/features/audit/audit.service';

/**
 * Phase 88 — the only function allowed to produce the value stored in
 * `AutomationExecutionStep.sanitizedInput`/`sanitizedOutput`. Reuses
 * `auditService.sanitizeMetadata`'s existing key-pattern redaction (password/secret/token/apikey/
 * credential/authorization/bearer) rather than reimplementing redaction — see
 * execution-engine.service.ts's `scrubForPersistence` for the Phase 87 precedent this mirrors.
 */
export function sanitizeForStorage(data: unknown): unknown {
  return auditService.sanitizeMetadata(data);
}
