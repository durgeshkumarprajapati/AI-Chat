describe('Server-Side Request Forgery (SSRF) Protection Tests', () => {
  function isPrivateUrl(urlStr: string): boolean {
    try {
      const parsed = new URL(urlStr);
      const host = parsed.hostname;
      return (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '169.254.169.254' ||
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        host.startsWith('172.16.')
      );
    } catch {
      return true; // Block invalid URLs safely
    }
  }

  it('blocks attempts to target AWS metadata endpoint', () => {
    expect(isPrivateUrl('http://169.254.169.254/latest/meta-data/')).toBe(true);
  });

  it('blocks attempts to target localhost or loopback IPs', () => {
    expect(isPrivateUrl('http://localhost:8080/admin')).toBe(true);
    expect(isPrivateUrl('http://127.0.0.1:5432')).toBe(true);
  });

  it('blocks private IPv4 subnet ranges', () => {
    expect(isPrivateUrl('http://10.0.0.1/internal')).toBe(true);
    expect(isPrivateUrl('http://192.168.1.1/router')).toBe(true);
  });

  it('allows public HTTPS domain URLs', () => {
    expect(isPrivateUrl('https://example.com/api/news')).toBe(false);
  });
});
