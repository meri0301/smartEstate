// Root config covers root-level JS files (commitlint, this file).
// Each workspace has its own eslint.config.mjs; ESLint 10 resolves the config
// nearest to the linted file, so `eslint --fix <path>` from lint-staged works
// for any file in the repository.
import { defineConfig, globalIgnores } from 'eslint/config';
import { node } from '@smartestate/eslint-config/node';

export default defineConfig(
  globalIgnores(['apps/**', 'packages/**', 'docker/**', 'docs/**']),
  node({ tsconfigRootDir: import.meta.dirname }),
);
