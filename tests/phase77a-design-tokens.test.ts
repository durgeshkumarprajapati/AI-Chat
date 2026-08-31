import { DESIGN_TOKENS, getToken, SEMANTIC_STATUS_TOKENS, DesignTokenName } from '@/lib/design-system/tokens';
import { BUTTON_VARIANTS, BADGE_VARIANTS, TABLE, SIDEBAR_NAV_ITEM } from '@/lib/design-system/theme.constants';

describe('Phase 77A — centralized design token module', () => {
  it('every DESIGN_TOKENS entry maps to a valid CSS custom property name', () => {
    for (const value of Object.values(DESIGN_TOKENS)) {
      expect(value).toMatch(/^--[a-z-]+$/);
    }
  });

  it('getToken() is SSR-safe — returns empty string when no DOM is available', () => {
    const originalWindow = global.window;
    // @ts-expect-error simulate SSR
    delete global.window;
    expect(getToken('primary')).toBe('');
    global.window = originalWindow;
  });

  it('every SEMANTIC_STATUS_TOKENS value references a real token name', () => {
    const validNames = new Set(Object.keys(DESIGN_TOKENS));
    for (const tokenName of Object.values(SEMANTIC_STATUS_TOKENS)) {
      expect(validNames.has(tokenName as DesignTokenName)).toBe(true);
    }
  });

  it('every button variant string is free of hardcoded hex colors', () => {
    for (const cls of Object.values(BUTTON_VARIANTS)) {
      expect(cls).not.toMatch(/#[0-9a-fA-F]{6}/);
    }
  });

  it('every badge variant string is free of hardcoded hex colors', () => {
    for (const cls of Object.values(BADGE_VARIANTS)) {
      expect(cls).not.toMatch(/#[0-9a-fA-F]{6}/);
    }
  });

  it('the unified table convention exposes head/row/divide classes with no hardcoded hex', () => {
    expect(TABLE.head).toMatch(/bg-muted/);
    expect(TABLE.row).toMatch(/hover:bg-accent/);
    for (const cls of Object.values(TABLE)) {
      expect(cls).not.toMatch(/#[0-9a-fA-F]{6}/);
    }
  });

  it('sidebar nav item active/inactive states are distinguishable and token-based', () => {
    expect(SIDEBAR_NAV_ITEM.active).not.toEqual(SIDEBAR_NAV_ITEM.inactive);
    expect(SIDEBAR_NAV_ITEM.active).toMatch(/bg-sidebar-active/);
    expect(SIDEBAR_NAV_ITEM.inactive).toMatch(/hover:bg-sidebar-hover/);
  });
});
