import { sarvamContentSanitizer } from '@/features/sarvam/security/sarvam-content-sanitizer';

describe('Phase 79 — Sarvam Security & Prompt Injection Protection', () => {
  it('strips script and style tags from untrusted text', () => {
    const dirty = '<script>alert("hack")</script>Hello <style>body{color:red}</style>World';
    const clean = sarvamContentSanitizer.sanitizeText(dirty);
    expect(clean).toBe('Hello World');
  });

  it('wraps external evidence in UNTRUSTED_DOCUMENT_EVIDENCE tags', () => {
    const raw = 'Document content from Sarvam';
    const wrapped = sarvamContentSanitizer.wrapUntrustedEvidence(raw, 'digitised');
    expect(wrapped).toContain('<UNTRUSTED_DOCUMENT_EVIDENCE source="sarvam" type="digitised">');
    expect(wrapped).toContain('Document content from Sarvam');
    expect(wrapped).toContain('</UNTRUSTED_DOCUMENT_EVIDENCE>');
  });
});
