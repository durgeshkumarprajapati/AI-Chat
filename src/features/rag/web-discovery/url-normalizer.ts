const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'ref',
  'source',
  'mc_cid',
  'mc_eid'
]);

export class UrlNormalizer {
  /**
   * Normalizes a URL string by resolving relative paths against a base URL,
   * stripping tracking query parameters, removing fragments, and standardizing protocol/host.
   */
  public static normalize(rawUrl: string, baseUrl?: string): string {
    try {
      const parsed = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);

      // Only allow http and https protocols
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return rawUrl;
      }

      // Remove URL hash fragment
      parsed.hash = '';

      // Strip tracking query parameters
      const searchParams = new URLSearchParams(parsed.search);
      let modified = false;
      for (const param of Array.from(searchParams.keys())) {
        if (TRACKING_PARAMS.has(param.toLowerCase())) {
          searchParams.delete(param);
          modified = true;
        }
      }

      if (modified) {
        parsed.search = searchParams.toString();
      }

      // Remove duplicate trailing slashes for pathname except root '/'
      if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
        parsed.pathname = parsed.pathname.slice(0, -1);
      }

      return parsed.toString();
    } catch {
      return rawUrl;
    }
  }

  /**
   * Extracts the clean hostname from a URL.
   */
  public static getHostname(rawUrl: string): string {
    try {
      return new URL(rawUrl).hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  /**
   * Checks if two URLs belong to the same registered domain/hostname.
   */
  public static isSameDomain(urlA: string, urlB: string): boolean {
    const hostA = this.getHostname(urlA);
    const hostB = this.getHostname(urlB);
    if (!hostA || !hostB) return false;
    return hostA === hostB || hostA.endsWith(`.${hostB}`) || hostB.endsWith(`.${hostA}`);
  }
}
