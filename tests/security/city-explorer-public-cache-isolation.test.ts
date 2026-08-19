import { cityExplorerCacheService } from '@/features/city-explorer/city-explorer.cache.service';

describe('Public Cache & Tenant Isolation Security Tests', () => {
  it('uses shared docai:city:public:v3:... cache keys without leaking private user IDs', () => {
    const fp = cityExplorerCacheService.computeFingerprint('Vadodara', 'about-city-overview', 'WEB_PUBLIC');
    const key = cityExplorerCacheService.getPublicCacheKey('Vadodara', 'about-city-overview', fp);

    expect(key).toContain('docai:city:public:v3:vadodara:about-city-overview');
    expect(key).not.toContain('user-');
    expect(key).not.toContain('tenant-');
  });
});
