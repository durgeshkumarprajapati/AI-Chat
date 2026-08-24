import { URLValidatorService } from '../../../src/features/web-intelligence/crawling/url-validator.service';

describe('SSRF & URL Security Validator Unit Tests', () => {
  const validator = new URLValidatorService();

  it('1. Allows safe public HTTPS and HTTP URLs', () => {
    expect(validator.validate('https://tavily.com/docs').isValid).toBe(true);
    expect(validator.validate('https://en.wikipedia.org/wiki/Artificial_intelligence').isValid).toBe(true);
    expect(validator.validate('http://example.com/api').isValid).toBe(true);
  });

  it('2. Blocks localhost and loopback IPv4/IPv6 addresses', () => {
    expect(validator.validate('http://localhost:3000').isValid).toBe(false);
    expect(validator.validate('http://127.0.0.1/admin').isValid).toBe(false);
    expect(validator.validate('http://0.0.0.0:8080').isValid).toBe(false);
    expect(validator.validate('http://[::1]/status').isValid).toBe(false);
  });

  it('3. Blocks private IPv4 subnet ranges', () => {
    // 10.0.0.0/8
    expect(validator.validate('http://10.0.0.1/secret').isValid).toBe(false);
    // 172.16.0.0/12
    expect(validator.validate('http://172.16.0.5/internal').isValid).toBe(false);
    expect(validator.validate('http://172.31.255.254/config').isValid).toBe(false);
    // 192.168.0.0/16
    expect(validator.validate('http://192.168.1.1/router').isValid).toBe(false);
  });

  it('4. Blocks Cloud Metadata endpoints (169.254.169.254)', () => {
    expect(validator.validate('http://169.254.169.254/latest/meta-data/').isValid).toBe(false);
    expect(validator.validate('http://metadata.google.internal/computeMetadata/v1/').isValid).toBe(false);
  });

  it('5. Blocks internal network TLDs (.local, .internal, .lan)', () => {
    expect(validator.validate('https://database.local/query').isValid).toBe(false);
    expect(validator.validate('https://auth-server.internal/token').isValid).toBe(false);
    expect(validator.validate('http://nas.lan/files').isValid).toBe(false);
  });

  it('6. Blocks invalid protocol schemes (file://, ftp://, gopher://)', () => {
    expect(validator.validate('file:///etc/passwd').isValid).toBe(false);
    expect(validator.validate('ftp://server.com/file').isValid).toBe(false);
    expect(validator.validate('javascript:alert(1)').isValid).toBe(false);
  });
});
