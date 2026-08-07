/**
 * Semantic design tokens (T008), per
 * specs/001-local-expense-tracker/contracts/design-system.md: mineral neutrals
 * with one evergreen accent, 12/16/24px spacing rhythm, 14/18/24px radius
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
  // Mineral charcoal neutrals (light theme)
  ink950: '#202622',
  ink900: '#2B332D',
  ink800: '#374239',
  ink700: '#465249',
  ink600: '#4F5A52',
  ink500: '#667268',
  ink400: '#9AA69B',
  ink300: '#C5CEC5',
  ink200: '#D5D2C8',
  ink100: '#E8E4D9',
  ink50: '#F3EFE7',
  // Evergreen accent
  cedar700: '#174A40',
  cedar600: '#1F6657',
  cedar500: '#2F806B',
  cedar400: '#6FC2A9',
  cedar300: '#A8DDC9',
  cedar100: '#DCEFE7',
  // Semantic states
  positive700: '#21563F',
  positive500: '#2F7058',
  positive100: '#E1F0E8',
  warning700: '#815414',
  warning500: '#A86F1B',
  warning100: '#F7ECCE',
  destructive700: '#87322D',
  destructive500: '#A43D36',
  destructive100: '#F8E1DE',
  focus: '#8A5A12',
  review700: '#62652E',
  review500: '#7E823D',
  review100: '#EEF0D8',
} as const;

export const SEMANTIC_TOKENS = {
  background: WEB_COLORS.ink50,
  elevated: '#FCFAF5',
  primaryText: WEB_COLORS.ink950,
  secondaryText: WEB_COLORS.ink600,
  mutedText: '#626D63',
  accent: WEB_COLORS.cedar600,
  accentHover: WEB_COLORS.cedar700,
  accentActive: WEB_COLORS.cedar700,
  positive: WEB_COLORS.positive500,
  warning: WEB_COLORS.warning700,
  destructive: WEB_COLORS.destructive500,
  focus: WEB_COLORS.focus,
  reviewNeeded: WEB_COLORS.review700,
  onAccent: '#FCFAF5',
  onDark: '#FCFAF5',
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

/** Category semantic colors that remain distinguishable without color alone. Legacy token names remain for vault compatibility. */
export const CATEGORY_COLORS = {
  cedar: WEB_COLORS.cedar500,
  slate: WEB_COLORS.ink600,
  violet: '#7E823D',
  sky: '#2F806B',
  rose: '#A43D36',
  emerald: '#2F7058',
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
