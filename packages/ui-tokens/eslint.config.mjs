import { defineConfig } from 'eslint/config';
import { node } from '@smartestate/eslint-config/node';

export default defineConfig(node({ tsconfigRootDir: import.meta.dirname }), {
  // The CSS generator is a CLI: stdout is its user interface.
  files: ['scripts/**/*.ts'],
  rules: { 'no-console': 'off' },
});
