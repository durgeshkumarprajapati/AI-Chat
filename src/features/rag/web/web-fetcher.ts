import { env } from '@/config/env';
import { InfrastructureError, ValidationError } from '@/errors';
import { webUrlValidator } from './web-url.validator';

export interface WebFetchResult {
  html: string;
  finalUrl: string;
  statusCode: number;
  headers: Record<string, string>;
}

export class WebFetcher {
  private timeoutMs: number;
  private maxBytes: number;
  private maxRedirects: number;

  constructor(timeoutMs?: number, maxBytes?: number, maxRedirects?: number) {
    this.timeoutMs = timeoutMs ?? env.server?.WEB_FETCH_TIMEOUT_MS ?? 10000;
    this.maxBytes = maxBytes ?? env.server?.WEB_FETCH_MAX_BYTES ?? 5000000;
    this.maxRedirects = maxRedirects ?? env.server?.WEB_MAX_REDIRECTS ?? 3;
  }

  /**
   * Safe HTTP fetch with SSRF protection, timeout, response byte limit, and safe redirect validation.
   */
  public async fetchUrl(targetUrlString: string): Promise<WebFetchResult> {
    let currentUrl = await webUrlValidator.assertSafeUrl(targetUrlString);
    let redirectsCount = 0;

    while (redirectsCount <= this.maxRedirects) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(currentUrl.toString(), {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'User-Agent': 'DocumentAI-RAGBot/1.0 (+https://github.com/durgeshkumarprajapati/AI-Chat)',
            'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9'
          },
          redirect: 'manual' // We handle redirects manually for SSRF security checks
        });

        clearTimeout(timer);

        // Check Redirects
        if (response.status >= 300 && response.status < 400) {
          const locationHeader = response.headers.get('location');
          if (!locationHeader) {
            throw new InfrastructureError('WebFetcher', `HTTP ${response.status} redirect missing Location header.`);
          }

          redirectsCount++;
          if (redirectsCount > this.maxRedirects) {
            throw new ValidationError(`Maximum redirects (${this.maxRedirects}) exceeded fetching URL.`);
          }

          const resolvedRedirectUrl = new URL(locationHeader, currentUrl);
          currentUrl = await webUrlValidator.assertSafeUrl(resolvedRedirectUrl.toString());
          continue;
        }

        if (!response.ok) {
          throw new InfrastructureError('WebFetcher', `HTTP request failed with status ${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType && !contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xhtml+xml')) {
          throw new ValidationError(`Unsupported content-type "${contentType}". Only HTML or text web pages are supported.`);
        }

        // Stream body with byte limit safety
        const reader = response.body?.getReader();
        if (!reader) {
          const text = await response.text();
          if (Buffer.byteLength(text) > this.maxBytes) {
            throw new ValidationError(`Response size exceeds maximum limit of ${this.maxBytes} bytes.`);
          }
          return {
            html: text,
            finalUrl: currentUrl.toString(),
            statusCode: response.status,
            headers: this.extractHeaders(response.headers)
          };
        }

        const chunks: Uint8Array[] = [];
        let totalBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            totalBytes += value.length;
            if (totalBytes > this.maxBytes) {
              reader.cancel().catch(() => {});
              throw new ValidationError(`Response size exceeds maximum limit of ${this.maxBytes} bytes.`);
            }
            chunks.push(value);
          }
        }

        const bodyBuffer = Buffer.concat(chunks);
        const htmlText = bodyBuffer.toString('utf-8');

        return {
          html: htmlText,
          finalUrl: currentUrl.toString(),
          statusCode: response.status,
          headers: this.extractHeaders(response.headers)
        };
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof ValidationError || err instanceof InfrastructureError) {
          throw err;
        }
        if ((err as any)?.name === 'AbortError') {
          throw new InfrastructureError('WebFetcher', `Request timed out after ${this.timeoutMs}ms.`);
        }
        throw new InfrastructureError('WebFetcher', `Failed to fetch URL: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    throw new ValidationError(`Maximum redirects (${this.maxRedirects}) exceeded fetching URL.`);
  }

  private extractHeaders(headers: Headers): Record<string, string> {
    const result: Record<string, string> = {};
    headers.forEach((value, key) => {
      result[key.toLowerCase()] = value;
    });
    return result;
  }
}

export const webFetcher = new WebFetcher();
