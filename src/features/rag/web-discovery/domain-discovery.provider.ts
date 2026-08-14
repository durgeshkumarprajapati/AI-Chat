import { WebDiscoveryProvider } from './web-discovery-provider.interface';
import { WebDiscoveryQueryOptions, WebDiscoverySearchResult } from './trusted-source.types';
import { webUrlValidator } from '../web/web-url.validator';
import { webFetcher } from '../web/web-fetcher';
import { webContentExtractor } from '../web/web-content-extractor';
import { robotsPolicyService } from './robots-policy';
import { UrlNormalizer } from './url-normalizer';

export class DomainDiscoveryProvider implements WebDiscoveryProvider {
  public readonly id = 'domain_discovery';
  public readonly name = 'Specific Website Discovery';

  public async search(options: WebDiscoveryQueryOptions): Promise<WebDiscoverySearchResult[]> {
    const rawTarget = options.targetWebsite?.trim();
    if (!rawTarget) return [];

    try {
      // 1. SSRF URL validation
      const safeUrl = await webUrlValidator.assertSafeUrl(rawTarget);
      const targetString = safeUrl.toString();
      const domain = UrlNormalizer.getHostname(targetString);

      // 2. Robots.txt check
      if (!options.skipRobotsCheck) {
        const allowed = await robotsPolicyService.isAllowed(targetString);
        if (!allowed) {
          console.warn(`[DomainDiscoveryProvider] URL ${targetString} disallowed by robots.txt`);
          return [];
        }
      }

      // 3. Fetch target page
      const fetchResult = await webFetcher.fetchUrl(targetString);
      const extractResult = webContentExtractor.extract(fetchResult.html, fetchResult.finalUrl);

      const rootResult: WebDiscoverySearchResult = {
        url: UrlNormalizer.normalize(fetchResult.finalUrl),
        canonicalUrl: extractResult.canonicalUrl || UrlNormalizer.normalize(fetchResult.finalUrl),
        title: extractResult.title || domain,
        snippet: extractResult.textContent.slice(0, 250).trim(),
        source: 'user_website',
        sourceType: 'WEB',
        domain,
        score: 1.0
      };

      const results: WebDiscoverySearchResult[] = [rootResult];
      const maxResults = options.maxResults || 5;

      // 4. Discover relevant internal links from page HTML
      const hrefRegex = /href=["']([^"']+)["']/gi;
      const queryTerms = options.query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3);

      let match;
      const seenUrls = new Set<string>([rootResult.url]);

      while ((match = hrefRegex.exec(fetchResult.html)) !== null && results.length < maxResults) {
        const rawHref = match[1];
        if (!rawHref) continue;

        const resolvedUrl = UrlNormalizer.normalize(rawHref, fetchResult.finalUrl);

        if (!UrlNormalizer.isSameDomain(resolvedUrl, targetString)) continue;
        if (seenUrls.has(resolvedUrl)) continue;

        // Skip non-HTML files (images, css, js, zip, pdf)
        if (resolvedUrl.match(/\.(png|jpg|jpeg|gif|css|js|zip|pdf|exe|dmg|svg|ico|woff|woff2|ttf|eot)$/i)) continue;

        seenUrls.add(resolvedUrl);

        // Check query relevance in URL path
        const lowerUrl = resolvedUrl.toLowerCase();
        const isRelevant = queryTerms.some((t) => lowerUrl.includes(t));
        if (isRelevant || results.length < 3) {
          const isPageAllowed = options.skipRobotsCheck ? true : await robotsPolicyService.isAllowed(resolvedUrl);
          if (isPageAllowed) {
            results.push({
              url: resolvedUrl,
              canonicalUrl: resolvedUrl,
              title: `${domain} - ${resolvedUrl.split('/').pop() || 'page'}`,
              snippet: `Internal documentation page on ${domain}`,
              source: 'user_website',
              sourceType: 'WEB',
              domain,
              score: isRelevant ? 0.9 : 0.7
            });
          }
        }
      }

      return results;
    } catch (err) {
      console.warn('[DomainDiscoveryProvider] Domain discovery failed:', err instanceof Error ? err.message : String(err));
      return [];
    }
  }
}

export const domainDiscoveryProvider = new DomainDiscoveryProvider();
