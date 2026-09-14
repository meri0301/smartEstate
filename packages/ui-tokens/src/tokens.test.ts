import { describe, expect, it } from 'vitest';
import { AA_NON_TEXT, AA_TEXT, AAA_TEXT, contrast } from './contrast.js';
import { renderTokensCss } from './render-css.js';
import {
  breakpointTokens,
  colorTokens,
  darkColorTokens,
  flattenTokens,
  tokenGroups,
} from './tokens.js';

const light = (key: string): string => {
  const token = colorTokens[key];
  if (token === undefined) {
    throw new Error(`Unknown light colour token: ${key}`);
  }
  return token.value;
};

const dark = (key: string): string => {
  const token = darkColorTokens[key];
  if (token === undefined) {
    throw new Error(`Unknown dark colour token: ${key}`);
  }
  return token.value;
};

describe('token integrity', () => {
  it('gives every token a value, a source and a reason', () => {
    for (const [name, token] of Object.entries(flattenTokens())) {
      expect(token.value, name).not.toBe('');
      expect(['figma', 'derived'], name).toContain(token.source);
      expect(token.note.length, name).toBeGreaterThan(10);
    }
  });

  it('uses unique custom property names across every group', () => {
    const names = tokenGroups.flatMap((g) => Object.keys(g.tokens).map((k) => `${g.prefix}-${k}`));
    expect(new Set(names).size).toBe(names.length);
  });

  it('keeps the light and dark palettes in step', () => {
    expect(Object.keys(darkColorTokens).sort()).toEqual(Object.keys(colorTokens).sort());
  });

  it('records the values actually read from the Figma file', () => {
    // Regression guard: if one of these changes, it is a deliberate departure
    // from the design and should be argued for, not an accident.
    expect(light('bg')).toBe('#FAFAFA');
    expect(light('surface-muted')).toBe('#E9EEED');
    expect(light('border')).toBe('#D9DDDC');
    expect(light('text')).toBe('#131313');
    expect(light('text-secondary')).toBe('#292D32');
    expect(light('accent')).toBe('#CEF279');
    expect(light('rating')).toBe('#F2B62A');
  });

  it('marks derived tokens honestly', () => {
    expect(colorTokens.accent?.source).toBe('figma');
    expect(colorTokens.success?.source).toBe('derived');
    expect(colorTokens.warning?.source).toBe('derived');
    expect(darkColorTokens.bg?.source).toBe('derived');
  });
});

describe('colour contrast', () => {
  const textPairs: [fg: string, bg: string, min: number][] = [
    ['text', 'bg', AAA_TEXT],
    ['text', 'surface', AAA_TEXT],
    ['text', 'surface-muted', AAA_TEXT],
    ['text-secondary', 'bg', AA_TEXT],
    ['text-secondary', 'surface-muted', AA_TEXT],
    ['text-muted', 'bg', AA_TEXT],
    ['text-muted', 'surface-muted', AA_TEXT],
    ['text-placeholder', 'surface-muted', AA_TEXT],
    ['on-accent', 'accent', AA_TEXT],
    ['on-inverse', 'inverse', AA_TEXT],
    ['success', 'success-subtle', AA_TEXT],
    ['warning', 'warning-subtle', AA_TEXT],
    ['danger', 'danger-subtle', AA_TEXT],
    ['info', 'info-subtle', AA_TEXT],
    ['success', 'bg', AA_TEXT],
    ['warning', 'bg', AA_TEXT],
    ['danger', 'bg', AA_TEXT],
    ['info', 'bg', AA_TEXT],
  ];

  it.each(textPairs)('light: %s on %s reaches %d:1', (fg, bg, min) => {
    expect(contrast(light(fg), light(bg))).toBeGreaterThanOrEqual(min);
  });

  it.each(textPairs)('dark: %s on %s reaches %d:1', (fg, bg, min) => {
    expect(contrast(dark(fg), dark(bg))).toBeGreaterThanOrEqual(min);
  });

  const nonTextPairs: [fg: string, bg: string][] = [
    ['border-interactive', 'bg'],
    ['border-interactive', 'surface'],
    ['border-interactive', 'surface-muted'],
    ['focus', 'bg'],
    ['focus', 'surface'],
  ];

  it.each(nonTextPairs)('light: %s against %s reaches 3:1', (fg, bg) => {
    expect(contrast(light(fg), light(bg))).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it.each(nonTextPairs)('dark: %s against %s reaches 3:1', (fg, bg) => {
    expect(contrast(dark(fg), dark(bg))).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it('documents that the accent and the rating amber are fills, not text or outlines', () => {
    // Both sit below 3:1 on the page, which is why the primitives only ever use
    // them as a filled background with dark ink on top.
    expect(contrast(light('accent'), light('bg'))).toBeLessThan(AA_NON_TEXT);
    expect(contrast(light('rating'), light('bg'))).toBeLessThan(AA_NON_TEXT);
  });
});

describe('generated stylesheet', () => {
  const css = renderTokensCss();

  it('declares every token as a custom property under :root', () => {
    const root = css.slice(css.indexOf(':root {'), css.indexOf(":root[data-theme='dark']"));
    for (const [name, token] of Object.entries(flattenTokens())) {
      expect(root, name).toContain(`${name}: ${token.value};`);
    }
  });

  it('overrides only colour in the dark theme, under both selection routes', () => {
    expect(css).toContain(":root[data-theme='dark']");
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(":root:not([data-theme='light'])");
    expect(css).toContain(`--se-color-bg: ${dark('bg')};`);
    // Non-colour groups must not be repeated in the dark block.
    const darkBlock = css.slice(css.indexOf(":root[data-theme='dark']"), css.indexOf('@media'));
    expect(darkBlock).not.toContain('--se-space-');
    expect(darkBlock).not.toContain('--se-radius-');
  });

  it('sets color-scheme so native controls follow the theme', () => {
    expect(css).toContain('color-scheme: light;');
    expect(css).toContain('color-scheme: dark;');
  });

  it('maps Tailwind utilities at the variable, not the value, so theming works', () => {
    expect(css).toContain('@theme inline {');
    expect(css).toContain('--color-accent: var(--se-color-accent);');
    expect(css).toContain('--radius-md: var(--se-radius-md);');
    // Breakpoints are the exception: a media query cannot resolve a custom property.
    expect(css).toContain(`--breakpoint-2xl: ${String(breakpointTokens['2xl']?.value)};`);
    expect(css).toContain('@theme {');
    expect(css).not.toMatch(/@theme inline \{[^}]*#[0-9A-Fa-f]{6}/);
  });

  it('omits groups that have no Tailwind namespace', () => {
    const theme = css.slice(css.indexOf('@theme inline {'));
    expect(theme).not.toContain('--z-');
    expect(theme).not.toContain('--duration-');
  });

  it('exposes layout sizes through the spacing namespace so h- and max-w- utilities work', () => {
    expect(css).toContain('--spacing-control: var(--se-layout-control);');
    expect(css).toContain('--spacing-content: var(--se-layout-content);');
    expect(css).toContain('--spacing-gutter: var(--se-layout-gutter);');
  });
});
