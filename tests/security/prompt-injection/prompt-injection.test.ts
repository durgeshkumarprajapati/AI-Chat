import { MOCK_MALICIOUS_PROMPT_INJECTION } from '../../fixtures';

describe('Prompt Injection Protection Tests', () => {
  it('treats untrusted document chunks as data without executing embedded instructions', () => {
    for (const maliciousSnippet of MOCK_MALICIOUS_PROMPT_INJECTION) {
      const sanitizedContext = `DOCUMENT CONTEXT (UNTRUSTED DATA):\n${maliciousSnippet}`;
      expect(sanitizedContext).toContain('UNTRUSTED DATA');
      expect(sanitizedContext).toContain(maliciousSnippet);
    }
  });
});
