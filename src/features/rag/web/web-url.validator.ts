import dns from 'dns';
import { ValidationError } from '@/errors';

export interface URLValidationResult {
  isValid: boolean;
  url?: URL;
  resolvedIp?: string;
  error?: string;
}

export class WebUrlValidator {
  /**
   * Validates a URL string for SSRF protection and safety.
   */
  public async validate(urlString: string): Promise<URLValidationResult> {
    if (!urlString || typeof urlString !== 'string') {
      return { isValid: false, error: 'URL string is required' };
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlString.trim());
    } catch {
      return { isValid: false, error: 'Invalid URL format' };
    }

    // 1. Protocol check — ONLY http and https allowed
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return {
        isValid: false,
        error: `Forbidden protocol "${parsedUrl.protocol}". Only http:// and https:// are allowed.`
      };
    }

    const hostname = parsedUrl.hostname.toLowerCase();

    // 2. Blacklisted hostnames & cloud metadata endpoints
    const blacklistedHostnames = new Set([
      'localhost',
      '0.0.0.0',
      '::1',
      '127.0.0.1',
      '169.254.169.254',
      'metadata.google.internal',
      'instance-data'
    ]);

    if (blacklistedHostnames.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return { isValid: false, error: `Host "${hostname}" is forbidden for security (SSRF protection).` };
    }

    // 3. Perform DNS lookup to inspect resolved IP address
    try {
      const lookupResult = await dns.promises.lookup(hostname, { all: true });
      if (!lookupResult || lookupResult.length === 0) {
        return { isValid: false, error: `Could not resolve hostname "${hostname}".` };
      }

      for (const entry of lookupResult) {
        const ip = entry.address;
        if (this.isPrivateOrReservedIp(ip)) {
          return {
            isValid: false,
            error: `Resolved IP address "${ip}" for host "${hostname}" is private or reserved (SSRF protection).`
          };
        }
      }

      return {
        isValid: true,
        url: parsedUrl,
        resolvedIp: lookupResult[0]?.address
      };
    } catch (err) {
      return {
        isValid: false,
        error: `DNS resolution failed for host "${hostname}": ${err instanceof Error ? err.message : String(err)}`
      };
    }
  }

  /**
   * Asserts that a URL is safe. Throws ValidationError if unsafe.
   */
  public async assertSafeUrl(urlString: string): Promise<URL> {
    const res = await this.validate(urlString);
    if (!res.isValid || !res.url) {
      throw new ValidationError(res.error || 'Invalid or unsafe URL');
    }
    return res.url;
  }

  /**
   * Checks if an IP address belongs to loopback, private IPv4/IPv6, link-local, or cloud metadata ranges.
   */
  public isPrivateOrReservedIp(ip: string): boolean {
    if (!ip) return true;

    // IPv4 check
    if (ip.includes('.')) {
      const parts = ip.split('.').map(Number);
      if (parts.length !== 4 || parts.some(isNaN)) return true;

      const [p0, p1] = parts;

      // 0.0.0.0/8
      if (p0 === 0) return true;
      // 127.0.0.0/8 (Loopback)
      if (p0 === 127) return true;
      // 10.0.0.0/8 (Private)
      if (p0 === 10) return true;
      // 172.16.0.0/12 (Private 172.16.0.0 - 172.31.255.255)
      if (p0 === 172 && p1! >= 16 && p1! <= 31) return true;
      // 192.168.0.0/16 (Private)
      if (p0 === 192 && p1 === 168) return true;
      // 169.254.0.0/16 (Link-local & AWS Metadata)
      if (p0 === 169 && p1 === 254) return true;
      // 224.0.0.0/4 (Multicast)
      if (p0! >= 224) return true;

      return false;
    }

    // IPv6 check
    if (ip.includes(':')) {
      const lowerIp = ip.toLowerCase();
      if (lowerIp === '::1' || lowerIp === '::') return true;
      // Link-local fe80::/10
      if (lowerIp.startsWith('fe80:')) return true;
      // Unique local fc00::/7, fd00::/8
      if (lowerIp.startsWith('fc') || lowerIp.startsWith('fd')) return true;
    }

    return false;
  }
}

export const webUrlValidator = new WebUrlValidator();
