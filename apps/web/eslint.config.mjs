import { defineConfig, globalIgnores } from 'eslint/config';
import { react } from '@smartestate/eslint-config/react';

export default defineConfig(
  // Generated from the OpenAPI document; regenerate instead of editing.
  globalIgnores(['src/shared/api/schema.d.ts', 'storybook-static/**']),
  react({ tsconfigRootDir: import.meta.dirname }),
  {
    /*
     * The Fast Refresh rule wants a module to export components and nothing
     * else. In the design-system layer a hook, a variant table or a shared
     * class string belongs beside the component it serves, and splitting them
     * apart to satisfy a development-only optimisation would make the public
     * API harder to read. Stories are not part of the application bundle at
     * all, so the rule cannot apply to them either.
     */
    files: ['src/shared/ui/**/*.{ts,tsx}', '**/*.stories.tsx', '.storybook/**/*.{ts,tsx}'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
);
