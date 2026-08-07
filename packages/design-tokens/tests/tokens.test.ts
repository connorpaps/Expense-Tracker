import { describe, expect, it } from 'vitest';
import {
  CATEGORY_COLORS,
  RADIUS,
  SEMANTIC_TOKENS,
  SPACING,
  WEB_COLORS,
  contrastRatio,
  hexToRgb,
  iosDesignTokensSwift,
  webCssVariables,
} from '../src/index';

describe('Design tokens (T008)', () => {
  it('defines every semantic token required by the design contract', () => {
    const required = [
      'background',
      'elevated',
      'primaryText',
      'secondaryText',
      'mutedText',
      'accent',
      'positive',
      'warning',
      'destructive',
      'focus',
      'reviewNeeded',
    ] as const;
    for (const name of required) {
      expect(SEMANTIC_TOKENS[name], name).toBeDefined();
    }
  });

  it('meets WCAG AA contrast for text on light backgrounds', () => {
    const pairs: Array<[string, string, number]> = [
      [SEMANTIC_TOKENS.primaryText, SEMANTIC_TOKENS.background, 4.5],
      [SEMANTIC_TOKENS.secondaryText, SEMANTIC_TOKENS.background, 4.5],
      [SEMANTIC_TOKENS.accent, SEMANTIC_TOKENS.background, 3],
      [SEMANTIC_TOKENS.primaryText, SEMANTIC_TOKENS.elevated, 4.5],
      [SEMANTIC_TOKENS.secondaryText, SEMANTIC_TOKENS.elevated, 4.5],
      [SEMANTIC_TOKENS.onAccent, SEMANTIC_TOKENS.accent, 4.5],
    ];
    for (const [foreground, background, minimum] of pairs) {
      const ratio = contrastRatio(foreground, background);
      expect(ratio, `${foreground} on ${background}`).toBeGreaterThanOrEqual(minimum);
    }
  });

  it('keeps muted text readable only as secondary, never for critical data', () => {
    // Muted metadata remains readable at normal text sizes, while primary/secondary carry the strongest meaning.
    const mutedOnBg = contrastRatio(SEMANTIC_TOKENS.mutedText, SEMANTIC_TOKENS.background);
    expect(mutedOnBg).toBeGreaterThanOrEqual(4.5);
  });

  it('uses the documented spacing rhythm and radius tiers', () => {
    expect(Object.values(SPACING)).toEqual(expect.arrayContaining([12, 16, 24]));
    expect(Object.values(RADIUS)).toEqual(expect.arrayContaining([14, 18, 24]));
  });

  it('uses a single accent family', () => {
    expect(WEB_COLORS.cedar400.startsWith('#')).toBe(true);
    expect(SEMANTIC_TOKENS.accent).toBe(WEB_COLORS.cedar600);
    expect(SEMANTIC_TOKENS.accentHover).toBe(WEB_COLORS.cedar700);
  });

  it('parses hex colors correctly', () => {
    expect(hexToRgb('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(() => hexToRgb('nope')).toThrow();
  });

  it('emits CSS custom properties', () => {
    const css = webCssVariables();
    expect(css).toContain('--color-accent:');
    expect(css).toContain('--space-xl: 24px;');
    expect(css).toContain('--radius-lg: 24px;');
    expect(css.startsWith(':root {')).toBe(true);
  });

  it('emits iOS Swift tokens matching the web vocabulary', () => {
    const swift = iosDesignTokensSwift();
    expect(swift).toContain('enum ExpenseTrackerDesignTokens');
    expect(swift).toContain('static let Accent = Color(hex: 0x1F6657)');
    expect(swift).toContain('static let touchTargetMinimum = CGFloat(44)');
    expect(swift).toContain('init(hex: UInt32, opacity: Double = 1)');
  });

  it('provides distinguishable category colors with names (color is never the only meaning)', () => {
    const names = Object.keys(CATEGORY_COLORS);
    expect(names.length).toBeGreaterThanOrEqual(8);
    expect(new Set(names).size).toBe(names.length);
  });
});
