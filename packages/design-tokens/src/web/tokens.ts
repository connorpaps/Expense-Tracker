/**
 * Semantic design tokens (T008), per
 * specs/001-local-expense-tracker/contracts/design-system.md: cool ink neutrals
 * with one electric-copper accent, 12/16/24px spacing rhythm, 14/18/24px radius
 * tiers, and explicit semantic state tokens.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const number = Number.parseInt(full, 16);
  if (Number.isNaN(number) || full.length !== 6) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return { r: (number >> 16) & 0xff, g: (number >> 8) & 0xff, b: number & 0xff };
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const linearize = (channel: number) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG 2.x contrast ratio between two colors (1..21). */
export function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export const WEB_COLORS = {
  // Cool ink neutrals (light theme)
  ink950: '#14161B',
  ink900: '#1C2027',
  ink800: '#262B34',
  ink700: '#333B47',
  ink600: '#4B5565',
  ink500: '#6B7484',
  ink400: '#9AA3B0',
  ink300: '#C6CCD6',
  ink200: '#E1E5EB',
  ink100: '#EDF0F4',
  ink50: '#F7F8FA',
  // Electric copper accent
  copper700: '#8F4A1B',
  copper600: '#A8521D',
  copper500: '#C45E22',
  copper400: '#D97B3D',
  copper300: '#E8A36F',
  copper100: '#F7E9DD',
  // Semantic states
  positive700: '#1B5E20',
  positive500: '#2E7D32',
  positive100: '#E6F4E8',
  warning700: '#8A5300',
  warning500: '#B45309',
  warning100: '#FBF1DC',
  destructive700: '#A0201A',
  destructive500: '#B3261E',
  destructive100: '#FBE7E6',
  focus: '#2F6FED',
  review700: '#8A5300',
  review500: '#B45309',
  review100: '#FBF1DC',
} as const;

export const SEMANTIC_TOKENS = {
  background: WEB_COLORS.ink50,
  elevated: '#FFFFFF',
  primaryText: WEB_COLORS.ink950,
  secondaryText: WEB_COLORS.ink600,
  mutedText: '#7C8594',
  accent: WEB_COLORS.copper600,
  accentHover: WEB_COLORS.copper700,
  accentActive: WEB_COLORS.copper700,
  positive: WEB_COLORS.positive500,
  warning: WEB_COLORS.warning500,
  destructive: WEB_COLORS.destructive500,
  focus: WEB_COLORS.focus,
  reviewNeeded: WEB_COLORS.review500,
  onAccent: '#FFFFFF',
  onDark: '#FFFFFF',
  onLight: WEB_COLORS.ink950,
} as const;

export type SemanticTokenName = keyof typeof SEMANTIC_TOKENS;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const RADIUS = {
  sm: 14,
  md: 18,
  lg: 24,
} as const;

export const TYPE_SCALE = {
  display: { size: 32, weight: 700, lineHeight: 1.15 },
  heading1: { size: 24, weight: 700, lineHeight: 1.25 },
  heading2: { size: 18, weight: 650, lineHeight: 1.3 },
  body: { size: 14, weight: 400, lineHeight: 1.5 },
  bodyStrong: { size: 14, weight: 600, lineHeight: 1.5 },
  small: { size: 12, weight: 400, lineHeight: 1.4 },
  label: { size: 12, weight: 600, lineHeight: 1.3, letterSpacing: 0.04 },
} as const;

export const FONTS = {
  /**
   * Humanist display face. The design contract calls for an expressive but
   * restrained display pairing; the named face must be vendored locally to
   * preserve the offline $0 requirement (never loaded from a CDN).
   */
  display: "'Fraunces', Georgia, 'Times New Roman', serif",
  sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace",
} as const;

export const MOTION = {
  fast: 120,
  normal: 180,
  slow: 280,
  curve: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

/** Category semantic colors that remain distinguishable without color alone. */
export const CATEGORY_COLORS = {
  copper: WEB_COLORS.copper500,
  slate: WEB_COLORS.ink600,
  violet: '#7C5CD6',
  sky: '#2E86C1',
  rose: '#C44B6E',
  emerald: '#2F9E63',
  amber: WEB_COLORS.warning500,
  green: WEB_COLORS.positive500,
  gray: WEB_COLORS.ink400,
  stone: '#8A7A63',
} as const;

/** CSS custom property declarations consumed by the web app. */
export function webCssVariables(): string {
  const colors = Object.entries(SEMANTIC_TOKENS)
    .map(([name, value]) => `  --color-${toKebab(name)}: ${value};`)
    .join('\n');
  const spacing = Object.entries(SPACING)
    .map(([name, value]) => `  --space-${name}: ${value}px;`)
    .join('\n');
  const radius = Object.entries(RADIUS)
    .map(([name, value]) => `  --radius-${name}: ${value}px;`)
    .join('\n');
  return `:root {\n${colors}\n${spacing}\n${radius}\n  --font-display: ${FONTS.display};\n  --font-sans: ${FONTS.sans};\n  --font-mono: ${FONTS.mono};\n  --motion-fast: ${MOTION.fast}ms;\n  --motion-normal: ${MOTION.normal}ms;\n  --motion-slow: ${MOTION.slow}ms;\n  --motion-curve: ${MOTION.curve};\n}`;
}

function toKebab(name: string): string {
  return name.replace(/([A-Z])/g, '-$1').toLowerCase();
}
