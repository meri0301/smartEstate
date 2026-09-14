/**
 * Enforces the design-system rule from the brief: no hard-coded colour values
 * anywhere in components. Every colour must arrive through a token, either as a
 * Tailwind utility backed by `@theme` or as `var(--se-*)`.
 *
 * A lint rule cannot express this, because the literal would be inside a
 * className string, so it is checked here instead.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const UI_DIR = path.resolve(import.meta.dirname);

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|oklch|color-mix)\s*\(/g;

function sourceFiles(): string[] {
  return readdirSync(UI_DIR)
    .filter((name) => /\.tsx?$/.test(name))
    .filter((name) => !name.endsWith('.test.ts') && !name.endsWith('.test.tsx'))
    .filter((name) => !name.endsWith('.stories.tsx'))
    .map((name) => path.join(UI_DIR, name));
}

describe('token hygiene', () => {
  const files = sourceFiles();

  it('finds the primitives', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it.each(files.map((file) => [path.basename(file), file] as const))(
    '%s contains no literal colours',
    (_name, file) => {
      const source = readFileSync(file, 'utf8');
      expect(source.match(HEX) ?? []).toEqual([]);
      expect(source.match(COLOUR_FUNCTION) ?? []).toEqual([]);
    },
  );

  it.each(files.map((file) => [path.basename(file), file] as const))(
    '%s uses only token-backed custom properties',
    (_name, file) => {
      const source = readFileSync(file, 'utf8');
      const vars = [...source.matchAll(/var\((--[a-z0-9-]+)/g)].map((match) => match[1]);
      for (const name of vars) {
        expect(name, `${_name} reads a non-token custom property`).toMatch(/^--se-/);
      }
    },
  );
});
