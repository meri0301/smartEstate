import {
  cssVarName,
  darkColorTokens,
  tokenGroups,
  type TokenGroup,
  type TokenGroupSpec,
} from './tokens.js';

const GENERATED_HEADER = `/*
 * GENERATED FILE — do not edit.
 * Run \`pnpm --filter @smartestate/ui-tokens tokens:css\` after changing src/tokens.ts.
 * CI regenerates this file and fails if the committed copy is stale.
 *
 * Three layers live here:
 *   1. \`--se-*\` custom properties, the themeable source of every value.
 *   2. Theme overrides for dark, selected explicitly with [data-theme] and
 *      implicitly with prefers-color-scheme when no choice has been made.
 *   3. An \`@theme inline\` block that points Tailwind's utilities at the
 *      custom properties, so utilities re-resolve when the theme changes
 *      instead of baking in a literal colour.
 */`;

function declarations(prefix: string, tokens: TokenGroup, indent: string): string {
  return Object.entries(tokens)
    .map(([key, token]) => `${indent}${cssVarName(prefix, key)}: ${token.value};`)
    .join('\n');
}

function lightBlock(): string {
  const body = tokenGroups
    .map((group) => `  /* ${group.label} */\n${declarations(group.prefix, group.tokens, '  ')}`)
    .join('\n\n');
  return `:root {\n  color-scheme: light;\n\n${body}\n}`;
}

function darkDeclarations(indent: string): string {
  return declarations('color', darkColorTokens, indent);
}

function darkBlocks(): string {
  const explicit = `:root[data-theme='dark'] {\n  color-scheme: dark;\n\n${darkDeclarations('  ')}\n}`;
  const systemPreference = [
    '@media (prefers-color-scheme: dark) {',
    "  :root:not([data-theme='light']) {",
    '    color-scheme: dark;',
    '',
    darkDeclarations('    '),
    '  }',
    '}',
  ].join('\n');
  const explicitLight = `:root[data-theme='light'] {\n  color-scheme: light;\n}`;
  return [explicit, systemPreference, explicitLight].join('\n\n');
}

function themeGroupLines(group: TokenGroupSpec): string {
  const lines = Object.entries(group.tokens)
    .map(([key, token]) =>
      group.themeMode === 'static'
        ? `  --${String(group.tailwind)}-${key}: ${token.value};`
        : `  --${String(group.tailwind)}-${key}: var(${cssVarName(group.prefix, key)});`,
    )
    .join('\n');
  return `  /* ${group.label} */\n${lines}`;
}

function themeBlocks(): string {
  const mapped = tokenGroups.filter((group) => group.tailwind !== null);
  const inline = mapped.filter((group) => group.themeMode !== 'static').map(themeGroupLines);
  const literal = mapped.filter((group) => group.themeMode === 'static').map(themeGroupLines);
  return [
    `@theme inline {\n${inline.join('\n\n')}\n}`,
    '/* Emitted literally: a media query cannot resolve a custom property. */\n' +
      `@theme {\n${literal.join('\n\n')}\n}`,
  ].join('\n\n');
}

/** Full contents of `styles/tokens.css`. */
export function renderTokensCss(): string {
  return [GENERATED_HEADER, lightBlock(), darkBlocks(), themeBlocks()].join('\n\n') + '\n';
}
