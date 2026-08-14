import { UrlNormalizer } from './url-normalizer';

type RobotsRule = {
  allow: string[];
  disallow: string[];
};

type CacheEntry = {
  rules: RobotsRule;
  expiresAt: number;
};

export class RobotsPolicyService {
  private cache = new Map<string, CacheEntry>();
  private readonly userAgent = 'DocumentAIRAGBot/1.0';

  /**
   * Checks if a target URL is allowed by the domain's robots.txt policy.
   */
  public async isAllowed(targetUrl: string): Promise<boolean> {
    try {
      const parsedUrl = new URL(targetUrl);
      const origin = parsedUrl.origin;
      const pathname = parsedUrl.pathname || '/';

      const rules = await this.getRulesForOrigin(origin);

      // 1. Check specific Disallow rules
      for (const pattern of rules.disallow) {
        if (pattern === '/' && rules.allow.length === 0) {
          return false;
        }
        if (pattern && pathname.startsWith(pattern)) {
          // Check if an explicit Allow rule overrides this Disallow rule
          const isExplicitlyAllowed = rules.allow.some((allowPattern) => pathname.startsWith(allowPattern));
          if (!isExplicitlyAllowed) {
            return false;
          }
        }
      }

      return true;
    } catch {
      // Conservative fallback: Allow standard public pages, reject common admin paths
      const hostname = UrlNormalizer.getHostname(targetUrl);
      if (!hostname) return false;
      const lower = targetUrl.toLowerCase();
      if (lower.includes('/admin') || lower.includes('/wp-admin') || lower.includes('/login')) {
        return false;
      }
      return true;
    }
  }

  private async getRulesForOrigin(origin: string): Promise<RobotsRule> {
    const cached = this.cache.get(origin);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.rules;
    }

    const rules: RobotsRule = { allow: [], disallow: [] };

    try {
      const robotsUrl = `${origin}/robots.txt`;
      const response = await fetch(robotsUrl, {
        signal: AbortSignal.timeout(3000),
        headers: { 'User-Agent': this.userAgent }
      });

      if (response.ok) {
        const text = await response.text();
        const lines = text.split('\n');
        let isTargetAgent = false;

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;

          const colonIndex = trimmed.indexOf(':');
          if (colonIndex === -1) continue;

          const key = trimmed.slice(0, colonIndex).trim().toLowerCase();
          const value = trimmed.slice(colonIndex + 1).trim();

          if (key === 'user-agent') {
            const agentVal = value.toLowerCase().trim();
            isTargetAgent = agentVal === '*' || agentVal === 'documentairagbot' || agentVal === 'documentairagbot/1.0';
          } else if (isTargetAgent) {
            if (key === 'disallow' && value) {
              rules.disallow.push(value);
            } else if (key === 'allow' && value) {
              rules.allow.push(value);
            }
          }
        }
      }
    } catch {
      // Ignore network errors and return default rule structure
    }

    // Cache rules for 1 hour
    this.cache.set(origin, {
      rules,
      expiresAt: Date.now() + 3600 * 1000
    });

    return rules;
  }
}

export const robotsPolicyService = new RobotsPolicyService();
