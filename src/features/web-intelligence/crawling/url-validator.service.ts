export interface URLValidationResult {
  isValid: boolean;
  reason?: string;
  normalizedUrl?: string;
}

export class URLValidatorService {
  private static BLOCKED_HOSTNAMES = new Set([
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    'metadata.google.internal',
    '169.254.169.254'
  ]);

  /**
   * Validates URLs against SSRF vulnerabilities, loopbacks, and private IP subnets.
   */
  public validate(rawUrl: string): URLValidationResult {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return { isValid: false, reason: 'URL string is empty or undefined' };
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl.trim());
    } catch {
      return { isValid: false, reason: 'Malformed URL format' };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { isValid: false, reason: `Unsupported protocol scheme: ${parsed.protocol}` };
    }

    const hostname = parsed.hostname.toLowerCase();
    const cleanHostname = hostname.replace(/^\[|\]$/g, '');

    if (URLValidatorService.BLOCKED_HOSTNAMES.has(cleanHostname)) {
      return { isValid: false, reason: `Blocked restricted hostname or IP: ${hostname}` };
    }

    if (
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname.endsWith('.lan')
    ) {
      return { isValid: false, reason: `Blocked internal TLD extension: ${hostname}` };
    }

    // Check IPv4 private subnets
    const ipMatch = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
    if (ipMatch) {
      const [_, o1, o2] = ipMatch.map(Number);
      // 127.0.0.0/8
      if (o1 === 127) return { isValid: false, reason: 'Loopback IPv4 range blocked' };
      // 10.0.0.0/8
      if (o1 === 10) return { isValid: false, reason: 'Private 10.x.x.x IPv4 range blocked' };
      // 172.16.0.0/12 (172.16 - 172.31)
      if (o1 === 172 && o2 !== undefined && o2 >= 16 && o2 <= 31) return { isValid: false, reason: 'Private 172.16-31.x.x IPv4 range blocked' };
      // 192.168.0.0/16
      if (o1 === 192 && o2 === 168) return { isValid: false, reason: 'Private 192.168.x.x IPv4 range blocked' };
      // 169.254.0.0/16 (Link Local / Cloud Metadata)
      if (o1 === 169 && o2 === 254) return { isValid: false, reason: 'Link-local IPv4 metadata range blocked' };
      // 0.0.0.0
      if (o1 === 0) return { isValid: false, reason: 'Wildcard 0.0.0.0 blocked' };
    }

    return {
      isValid: true,
      normalizedUrl: parsed.toString()
    };
  }
}

export const urlValidatorService = new URLValidatorService();
