/** Shared Redis key builders, kept in their own module so subscription.service.ts and
 * entitlement.service.ts can both invalidate the entitlement cache without importing each other. */
export const ENTITLEMENT_CACHE_PREFIX = 'docai:billing:entitlements:user:';

export function entitlementCacheKey(userId: string): string {
  return `${ENTITLEMENT_CACHE_PREFIX}${userId}`;
}
