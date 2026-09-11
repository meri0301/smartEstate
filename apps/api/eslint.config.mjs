import { defineConfig } from 'eslint/config';
import { node } from '@smartestate/eslint-config/node';

export default defineConfig(node({ tsconfigRootDir: import.meta.dirname }), {
  files: ['**/*.ts'],
  rules: {
    // NestJS resolves providers from constructor parameter types; the
    // decorator-metadata emit needs them as value imports, not type imports.
    '@typescript-eslint/consistent-type-imports': [
      'error',
      { prefer: 'type-imports', fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
    ],
    // Controllers and providers are classes with no static members by design.
    '@typescript-eslint/no-extraneous-class': 'off',
  },
});
