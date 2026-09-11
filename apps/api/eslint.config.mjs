import { defineConfig, globalIgnores } from 'eslint/config';
import { node } from '@smartestate/eslint-config/node';

export default defineConfig(
  // Prisma Client is generated code; it ships its own eslint-disable header.
  globalIgnores(['src/generated/**']),
  node({ tsconfigRootDir: import.meta.dirname }),
  {
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
  },
  {
    // Seed, ERD and data scripts are CLIs: stdout is their user interface.
    files: ['prisma/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
