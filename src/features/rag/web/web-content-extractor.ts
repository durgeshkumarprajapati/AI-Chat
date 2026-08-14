import crypto from 'crypto';

export interface WebExtractResult {
  title: string;
  canonicalUrl: string;
  textContent: string;
  contentHash: string;
}

export class WebContentExtractor {
  /**
   * Extracts clean, structured readable text from raw HTML for RAG chunking.
   * Strips scripts, styles, navigation, headers, footers, and ads.
   */
  public extract(html: string, urlString: string): WebExtractResult {
    if (!html || !html.trim()) {
      const fallbackTitle = this.deriveTitleFromUrl(urlString);
      return {
        title: fallbackTitle,
        canonicalUrl: urlString,
        textContent: '',
        contentHash: crypto.createHash('sha256').update('').digest('hex')
      };
    }

    // 1. Extract title
    let title = '';
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = this.cleanHtmlEntities(titleMatch[1].trim());
    }
    if (!title) {
      title = this.deriveTitleFromUrl(urlString);
    }

    // 2. Extract canonical URL if specified in meta/link tags
    let canonicalUrl = urlString;
    const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
    if (canonicalMatch && canonicalMatch[1]) {
      try {
        canonicalUrl = new URL(canonicalMatch[1], urlString).toString();
      } catch {
        canonicalUrl = urlString;
      }
    }

    // 3. Remove non-content tags: script, style, nav, header, footer, svg, iframe, noscript, style
    let cleanHtml = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<svg[\s\S]*?<\/svg>/gi, '')
      .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

    // 4. Convert structural block tags to formatted text boundaries
    cleanHtml = cleanHtml
      .replace(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi, '\n\n# $1\n\n')
      .replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>/gi, '\n\n## $1\n\n')
      .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n\n$1\n\n')
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
      .replace(/<tr[^>]*>([\s\S]*?)<\/tr>/gi, '\n$1')
      .replace(/<th[^>]*>([\s\S]*?)<\/th>/gi, ' | $1')
      .replace(/<td[^>]*>([\s\S]*?)<\/td>/gi, ' | $1')
      .replace(/<br\s*\/?>/gi, '\n');

    // 5. Strip all remaining HTML tags
    let rawText = cleanHtml.replace(/<[^>]+>/g, ' ');

    // 6. Decode HTML entities & normalize whitespace
    rawText = this.cleanHtmlEntities(rawText);
    const textContent = rawText
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter((line) => line.length > 0)
      .join('\n');

    const contentHash = crypto.createHash('sha256').update(textContent).digest('hex');

    return {
      title,
      canonicalUrl,
      textContent,
      contentHash
    };
  }

  private cleanHtmlEntities(text: string): string {
    return text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&mdash;/g, '—')
      .replace(/&ndash;/g, '–');
  }

  private deriveTitleFromUrl(urlString: string): string {
    try {
      const u = new URL(urlString);
      const host = u.hostname.replace(/^www\./, '');
      const path = u.pathname.replace(/\/$/, '');
      if (path && path !== '/') {
        const lastSegment = path.split('/').pop();
        if (lastSegment) {
          const formatted = lastSegment.replace(/[-_]/g, ' ');
          return `${formatted.charAt(0).toUpperCase() + formatted.slice(1)} | ${host}`;
        }
      }
      return host;
    } catch {
      return urlString;
    }
  }
}

export const webContentExtractor = new WebContentExtractor();
