/**
 * SmartEstate design tokens.
 *
 * This file is the single source of truth. `styles/tokens.css` is generated
 * from it by `pnpm tokens:css`, and CI fails when the committed CSS is stale,
 * so a value can never exist in one place and not the other.
 *
 * Every token records where it came from:
 *  - `figma`   read from the SmartEstate Figma file (frame `Landing Page`, 1440×5048)
 *  - `derived` not present in the design and reasoned from it; the note says why
 *
 * The design is a light-only marketing page with no shadows and no gradients,
 * so the dark theme and the status colours are necessarily derived. Keeping the
 * distinction in the data lets the thesis state exactly which decisions were the
 * designer's and which were the implementer's.
 */

export type TokenSource = 'figma' | 'derived';

export interface Token {
  readonly value: string;
  readonly source: TokenSource;
  readonly note: string;
}

export type TokenGroup = Readonly<Record<string, Token>>;

const figma = (value: string, note: string): Token => ({ value, source: 'figma', note });
const derived = (value: string, note: string): Token => ({ value, source: 'derived', note });

// ---------------------------------------------------------------------------
// Colour — light theme (the only theme the design defines)
// ---------------------------------------------------------------------------

export const colorTokens: TokenGroup = {
  bg: figma('#FAFAFA', 'Page background of the Landing Page frame'),
  surface: derived(
    '#FFFFFF',
    'Elevated card fill; the valuation card reads white against the page',
  ),
  'surface-muted': figma('#E9EEED', 'Feature cards, inputs and other recessed fills'),
  border: figma('#D9DDDC', 'Default 1px hairline around cards and inputs; decorative only'),
  'border-strong': figma('#9A9A9A', 'Emphasised border; 2.7:1 on the page, so not load-bearing'),
  'border-interactive': derived(
    '#5F6462',
    'Boundary of form controls, where WCAG requires 3:1; the design hairlines do not reach it',
  ),

  text: figma('#131313', 'Primary ink; headings and body emphasis'),
  'text-secondary': figma('#292D32', 'Body copy ink'),
  'text-muted': figma('#404040', 'De-emphasised copy'),
  'text-placeholder': derived(
    '#5F6462',
    'The design places #B4B4B4 in inputs, which is 2:1 on the muted fill and fails AA; darkened to pass',
  ),

  accent: figma('#CEF279', 'Lime brand accent: primary buttons and icon chips'),
  'accent-hover': derived('#BCE45C', 'Accent darkened ~6% for hover; design has no hover states'),
  'accent-active': derived('#A8D63F', 'Accent darkened ~12% for the pressed state'),
  'accent-subtle': derived('#EEF9D5', 'Accent tinted for badge and selection backgrounds'),
  'on-accent': figma('#131313', 'Ink used on the lime button in the design'),

  inverse: figma('#131313', 'Dark CTA surface used for the secondary button'),
  'on-inverse': derived('#FAFAFA', 'Ink on the dark CTA surface'),

  success: derived(
    '#1F7A4D',
    'No success colour in the design; green chosen to sit beside the lime accent',
  ),
  'success-subtle': derived('#E3F3E9', 'Tinted success background for badges'),
  warning: derived(
    '#8A5A00',
    'The design amber is 1.8:1 on the page and cannot carry text; this darkened amber passes AA',
  ),
  'warning-subtle': derived('#FDF2D9', 'Tinted warning background for badges'),
  rating: figma('#F2B62A', 'Amber star fill; decorative, never used for text'),
  'rating-track': figma('#EAE0B4', 'Empty portion of a star rating'),
  danger: derived(
    '#B3261E',
    'No error colour in the design; red chosen for AA contrast on the page background',
  ),
  'danger-subtle': derived('#F8E5E3', 'Tinted danger background for badges'),
  info: derived(
    '#2F5FD0',
    'No informational colour in the design; blue avoids clashing with the lime accent',
  ),
  'info-subtle': derived('#E6ECFA', 'Tinted info background, used for machine-translation notices'),

  focus: derived('#131313', 'Focus ring; ink gives the strongest contrast on every light surface'),
  'brand-mark': figma('#231F20', 'Wordmark ink in the header and footer'),
  overlay: derived('#131313', 'Scrim colour behind modals, applied at reduced opacity'),
};

/**
 * Dark theme. Entirely derived: surfaces are lifted in small steps rather than
 * inverted, the lime accent is kept because it stays legible on dark, and the
 * status hues are lightened so they still pass AA on the dark surfaces.
 */
export const darkColorTokens: TokenGroup = {
  bg: derived('#0E100F', 'Near-black with the faint green cast of the light palette'),
  surface: derived('#171A19', 'First elevation step'),
  'surface-muted': derived('#1E2221', 'Recessed fill, mirrors surface-muted in light'),
  border: derived('#2C3130', 'Hairline that stays visible without glowing'),
  'border-strong': derived('#4B5250', 'Emphasised border'),
  'border-interactive': derived('#8A918E', 'Form control boundary, meets 3:1 on the dark surfaces'),

  text: derived('#F4F6F4', 'Primary ink, slightly off-white to reduce halation'),
  'text-secondary': derived('#C9CFCC', 'Body copy ink'),
  'text-muted': derived('#9AA19E', 'De-emphasised copy'),
  'text-placeholder': derived('#8A918E', 'Placeholder text, still AA on the muted fill'),

  accent: derived('#CEF279', 'Accent is unchanged; it carries the brand in both themes'),
  'accent-hover': derived(
    '#DDF79B',
    'Accent lightened for hover, since darkening disappears on dark',
  ),
  'accent-active': derived('#BCE45C', 'Pressed state'),
  'accent-subtle': derived('#25301A', 'Accent-tinted background for badges on dark'),
  'on-accent': derived('#131313', 'Ink on the lime button stays dark in both themes'),

  inverse: derived('#F4F6F4', 'The inverse surface flips to light on a dark page'),
  'on-inverse': derived('#131313', 'Ink on the inverse surface'),

  success: derived('#5FD39A', 'Lightened so it passes AA on the dark surfaces'),
  'success-subtle': derived('#13301F', 'Dark success background'),
  warning: derived('#F5C452', 'Amber lightened so it carries text on dark surfaces'),
  'warning-subtle': derived('#3A2E0C', 'Dark warning background'),
  rating: derived('#F5C452', 'Star fill, lightened to stay visible on dark'),
  'rating-track': derived('#4A4020', 'Empty portion of a star rating on dark'),
  danger: derived('#FF8A80', 'Lightened red for dark surfaces'),
  'danger-subtle': derived('#3A1512', 'Dark danger background'),
  info: derived('#9BB8FF', 'Lightened blue for dark surfaces'),
  'info-subtle': derived('#131F3A', 'Dark info background'),

  focus: derived('#CEF279', 'Accent is the clearest focus ring on dark'),
  'brand-mark': derived('#F4F6F4', 'Wordmark inverts with the page'),
  overlay: derived('#000000', 'Scrim is pure black on dark so the lift is still readable'),
};

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

/**
 * Family stacks. Krona One covers only Latin, so the Armenian and Cyrillic
 * display faces are supplied per locale in `styles/fonts.css`; the stacks below
 * are the Latin defaults plus per-glyph fallbacks for stray non-Latin text.
 */
export const fontTokens: TokenGroup = {
  display: figma(
    "'Krona One', 'Noto Sans Armenian', 'Montserrat', system-ui, sans-serif",
    'Headings; Krona One is the design face and is Latin-only',
  ),
  body: figma(
    "'Montserrat', 'Noto Sans Armenian', system-ui, sans-serif",
    'Body copy; Montserrat covers Latin and Cyrillic but not Armenian',
  ),
  mono: derived(
    "ui-monospace, 'Cascadia Mono', 'Segoe UI Mono', 'Roboto Mono', monospace",
    'Not in the design; used for identifiers and tabular figures',
  ),
};

export const fontSizeTokens: TokenGroup = {
  xs: derived('0.75rem', '12px, for captions and helper text'),
  sm: derived('0.875rem', '14px, for dense labels'),
  base: figma('1rem', '16px body copy'),
  lg: figma('1.25rem', '20px card headings'),
  xl: figma('1.5rem', '24px hero and section headings'),
  '2xl': derived('2rem', '32px, for app screens that need more hierarchy than the landing page'),
  '3xl': derived('2.5rem', '40px, largest display size'),
};

export const lineHeightTokens: TokenGroup = {
  none: figma('1', 'Display headings are set solid in the design'),
  snug: derived('1.2', 'Multi-line headings need a little more room than 1'),
  normal: figma('1.4', 'Body copy line height'),
  relaxed: derived('1.6', 'Long-form paragraphs'),
};

export const fontWeightTokens: TokenGroup = {
  normal: figma('400', 'Every text layer in the design is weight 400'),
  medium: derived('500', 'Needed for emphasis in dense app UI'),
  semibold: derived('600', 'Buttons and table headers'),
  bold: derived('700', 'Display weight for the Armenian and Cyrillic faces'),
};

export const trackingTokens: TokenGroup = {
  normal: figma('0', 'Letter spacing is 0% throughout the design'),
  wide: derived('0.04em', 'Small uppercase labels need opening up'),
};

// ---------------------------------------------------------------------------
// Space, shape and layout
// ---------------------------------------------------------------------------

/** 4px base step. The design uses 8 and 16 for padding and ~28 between sections. */
export const spacingTokens: TokenGroup = {
  '0': derived('0rem', 'No space; collapses a gap without removing the declaration'),
  px: derived('1px', 'One physical pixel, for hairline offsets and nudges'),
  '1': derived('0.25rem', '4px, the base step of the scale'),
  '2': figma('0.5rem', '8px, the horizontal padding inside inputs'),
  '3': derived('0.75rem', '12px, between a label and its control'),
  '4': figma('1rem', '16px, the vertical padding inside inputs'),
  '5': derived('1.25rem', '20px, between form rows'),
  '6': derived('1.5rem', '24px, padding inside cards'),
  '7': figma('1.75rem', '28px, the ~29px gap the design puts between stacked sections'),
  '8': derived('2rem', '32px, between groups within a section'),
  '10': derived('2.5rem', '40px, between a heading and its content'),
  '12': derived('3rem', '48px, padding inside large panels'),
  '16': derived('4rem', '64px, between major blocks'),
  '20': derived('5rem', '80px, vertical rhythm between sections'),
  '24': derived('6rem', '96px, generous section separation'),
  '40': figma('10rem', '160px, the page gutter either side of the content column'),
};

export const radiusTokens: TokenGroup = {
  xs: figma('3px', 'Small chips and tags'),
  sm: figma('10px', 'Inputs and text areas'),
  md: figma('24px', '24px, the radius on every card in the design'),
  lg: figma('32px', 'Large panels'),
  full: figma('9999px', 'Pill buttons; the design uses a 34px radius on a 68px control'),
};

export const borderWidthTokens: TokenGroup = {
  thin: figma('1px', 'Default hairline'),
  medium: figma('1.5px', 'Emphasised outline'),
  thick: figma('2px', 'Focus and selected states'),
};

export const breakpointTokens: TokenGroup = {
  sm: derived(
    '40rem',
    '640px; the design is desktop-only, so small screens are an implementation decision',
  ),
  md: derived('48rem', '768px, tablet portrait'),
  lg: derived('64rem', '1024px, small laptop'),
  xl: derived('80rem', '1280px, desktop'),
  '2xl': figma('90rem', '1440px, the width of the design frame'),
};

/**
 * Layout sizes are mapped into Tailwind's `spacing` namespace, which is what
 * width, height, padding and margin utilities read, so these become
 * `max-w-content`, `px-gutter`, `h-control` and so on.
 */
export const layoutTokens: TokenGroup = {
  content: figma('70rem', '1120px content column between the page gutters'),
  gutter: figma('10rem', '160px margin either side of the content column'),
  page: figma('90rem', '1440px, the width of the design frame'),
  control: derived('2.75rem', '44px, the minimum comfortable touch target'),
  'control-sm': derived('2.25rem', '36px, compact control for dense toolbars'),
  'control-lg': derived('3.25rem', '52px, matches the prominence of the design’s buttons'),
};

// ---------------------------------------------------------------------------
// Elevation, depth and motion
// ---------------------------------------------------------------------------

/**
 * The design has no drop shadows: surfaces are separated by hairlines. Only
 * genuinely floating layers get a shadow, and it is deliberately soft.
 */
export const shadowTokens: TokenGroup = {
  none: figma('none', 'Cards and inputs in the design carry no shadow'),
  overlay: derived('0 16px 48px -12px rgb(19 19 19 / 0.24)', 'Modals, popovers and toasts only'),
};

export const zIndexTokens: TokenGroup = {
  base: derived('0', 'Document flow'),
  dropdown: derived('1000', 'Select menus'),
  sticky: derived('1100', 'Sticky headers and filter bars'),
  overlay: derived('1200', 'Modal scrim'),
  modal: derived('1300', 'Modal surface'),
  popover: derived('1400', 'Tooltips and popovers'),
  toast: derived('1500', 'Toasts sit above everything'),
};

export const durationTokens: TokenGroup = {
  fast: derived('120ms', 'Hover and colour changes'),
  base: derived('200ms', 'Most transitions'),
  slow: derived('320ms', 'Modal and drawer entrances'),
};

export const easingTokens: TokenGroup = {
  standard: derived('cubic-bezier(0.2, 0, 0, 1)', 'Decelerating curve for entrances and moves'),
  exit: derived('cubic-bezier(0.4, 0, 1, 1)', 'Accelerating curve for exits'),
};

// ---------------------------------------------------------------------------
// Group registry — drives CSS generation and the Tailwind theme mapping
// ---------------------------------------------------------------------------

export interface TokenGroupSpec {
  /** Segment used in the CSS custom property name: `--se-<prefix>-<key>`. */
  readonly prefix: string;
  /** Tailwind v4 theme namespace, or null when the group has no utility. */
  readonly tailwind: string | null;
  /**
   * How the value reaches Tailwind. `inline` emits `var(--se-*)` so the utility
   * follows the active theme. `static` emits the literal, which breakpoints
   * require because a media query cannot resolve a custom property.
   */
  readonly themeMode?: 'inline' | 'static';
  readonly label: string;
  readonly tokens: TokenGroup;
}

export const tokenGroups: readonly TokenGroupSpec[] = [
  { prefix: 'color', tailwind: 'color', label: 'Colour', tokens: colorTokens },
  { prefix: 'font', tailwind: 'font', label: 'Font families', tokens: fontTokens },
  { prefix: 'text', tailwind: 'text', label: 'Font sizes', tokens: fontSizeTokens },
  { prefix: 'leading', tailwind: 'leading', label: 'Line heights', tokens: lineHeightTokens },
  { prefix: 'weight', tailwind: 'font-weight', label: 'Font weights', tokens: fontWeightTokens },
  { prefix: 'tracking', tailwind: 'tracking', label: 'Letter spacing', tokens: trackingTokens },
  { prefix: 'space', tailwind: 'spacing', label: 'Spacing', tokens: spacingTokens },
  { prefix: 'radius', tailwind: 'radius', label: 'Radii', tokens: radiusTokens },
  { prefix: 'border', tailwind: null, label: 'Border widths', tokens: borderWidthTokens },
  {
    prefix: 'screen',
    tailwind: 'breakpoint',
    themeMode: 'static',
    label: 'Breakpoints',
    tokens: breakpointTokens,
  },
  { prefix: 'layout', tailwind: 'spacing', label: 'Layout', tokens: layoutTokens },
  { prefix: 'shadow', tailwind: 'shadow', label: 'Elevation', tokens: shadowTokens },
  { prefix: 'z', tailwind: null, label: 'Stacking order', tokens: zIndexTokens },
  { prefix: 'duration', tailwind: null, label: 'Durations', tokens: durationTokens },
  { prefix: 'ease', tailwind: 'ease', label: 'Easing', tokens: easingTokens },
];

/** CSS custom property name for a token, e.g. `--se-color-accent`. */
export function cssVarName(prefix: string, key: string): string {
  return `--se-${prefix}-${key}`;
}

/** `var(--se-color-accent)` — for use from TypeScript (charts, canvas, inline styles). */
export function cssVar(prefix: string, key: string): string {
  return `var(${cssVarName(prefix, key)})`;
}

/** Flat map of every light-theme token keyed by its CSS custom property name. */
export function flattenTokens(): Readonly<Record<string, Token>> {
  const out: Record<string, Token> = {};
  for (const group of tokenGroups) {
    for (const [key, token] of Object.entries(group.tokens)) {
      out[cssVarName(group.prefix, key)] = token;
    }
  }
  return out;
}
