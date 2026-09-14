/**
 * Writes styles/tokens.css from src/tokens.ts.
 *
 *   pnpm --filter @smartestate/ui-tokens tokens:css
 *
 * The output is committed; CI regenerates it and fails on a diff, so the
 * stylesheet can never drift from the TypeScript definitions.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderTokensCss } from '../src/render-css.js';
import { flattenTokens } from '../src/tokens.js';

const OUTPUT = path.resolve(import.meta.dirname, '../styles/tokens.css');

mkdirSync(path.dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, renderTokensCss(), 'utf8');

const tokens = Object.values(flattenTokens());
const fromFigma = tokens.filter((t) => t.source === 'figma').length;
console.info(
  `tokens: ${String(tokens.length)} written to ${OUTPUT} ` +
    `(${String(fromFigma)} from Figma, ${String(tokens.length - fromFigma)} derived)`,
);
