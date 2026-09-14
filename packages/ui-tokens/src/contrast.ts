/**
 * WCAG 2.1 relative luminance and contrast ratio.
 *
 * Lives in the token package rather than in a test so the same numbers can be
 * quoted in the accessibility section of the thesis and re-checked whenever a
 * token changes.
 */

/** Minimum contrast for body text (WCAG 2.1 SC 1.4.3, AA). */
export const AA_TEXT = 4.5;
/** Minimum contrast for text at 24px, or 18.66px bold, and larger. */
export const AA_LARGE_TEXT = 3;
/** Minimum contrast for body text at the enhanced level (SC 1.4.6, AAA). */
export const AAA_TEXT = 7;
/** Minimum contrast for control boundaries and meaningful graphics (SC 1.4.11). */
export const AA_NON_TEXT = 3;

function parseHex(hex: string): [number, number, number] {
  const value = hex.trim().replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new TypeError(`Not a 3 or 6 digit hex colour: ${hex}`);
  }
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ];
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance in [0, 1]. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** Contrast ratio between two colours, from 1 (identical) to 21 (black on white). */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

/** Rounded to two decimals, for readable assertion messages and documentation tables. */
export function contrast(foreground: string, background: string): number {
  return Math.round(contrastRatio(foreground, background) * 100) / 100;
}
