import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import { base } from './base.js';

/**
 * Preset for the Vite + React 19 web app.
 * - `react-hooks` enforces the Rules of Hooks and effect dependency correctness.
 * - `react-refresh` keeps modules HMR-safe (components only, in component files).
 *
 * @param {import('./base.js').BaseOptions} options
 * @returns {import('eslint').Linter.Config[]}
 */
export function react(options) {
  return defineConfig(
    base(options),
    {
      languageOptions: {
        globals: { ...globals.browser },
      },
    },
    {
      files: ['**/*.{ts,tsx}'],
      extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    },
  );
}
