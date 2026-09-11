import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

/**
 * @typedef {object} BaseOptions
 * @property {string} tsconfigRootDir Absolute directory containing the workspace tsconfig.json.
 *   Type-aware rules need it to locate the project; pass `import.meta.dirname`.
 */

/**
 * Language-agnostic strictness shared by every workspace:
 * - type-aware `strict` + `stylistic` presets from typescript-eslint,
 * - zero tolerance for `any` (NFR: "zero any, enforced by lint"),
 * - explicit return types on exported functions so public contracts are visible,
 * - Prettier owns formatting; its config disables conflicting stylistic rules.
 *
 * Plain JS files (configs, scripts) are linted without type information.
 *
 * @param {BaseOptions} options
 * @returns {import('eslint').Linter.Config[]}
 */
export function base({ tsconfigRootDir }) {
  return defineConfig(
    globalIgnores([
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.turbo/**',
    ]),
    {
      files: ['**/*.{ts,tsx,mts,cts}'],
      extends: [
        js.configs.recommended,
        tseslint.configs.strictTypeChecked,
        tseslint.configs.stylisticTypeChecked,
      ],
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/explicit-module-boundary-types': 'error',
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/no-misused-promises': [
          'error',
          { checksVoidReturn: { attributes: false } },
        ],
        'no-console': ['error', { allow: ['warn', 'error'] }],
        eqeqeq: ['error', 'always'],
        curly: ['error', 'all'],
      },
    },
    {
      files: ['**/*.{js,mjs,cjs}'],
      extends: [js.configs.recommended],
      rules: {
        'no-console': ['error', { allow: ['warn', 'error'] }],
        eqeqeq: ['error', 'always'],
      },
    },
    prettier,
  );
}
