import { defineConfig } from 'eslint/config';
import globals from 'globals';
import { base } from './base.js';

/**
 * Preset for Node.js workspaces (NestJS API, shared packages, root scripts).
 *
 * @param {import('./base.js').BaseOptions} options
 * @returns {import('eslint').Linter.Config[]}
 */
export function node(options) {
  return defineConfig(base(options), {
    languageOptions: {
      globals: { ...globals.node },
    },
  });
}
