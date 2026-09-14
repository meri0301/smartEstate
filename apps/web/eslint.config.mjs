import { defineConfig, globalIgnores } from 'eslint/config';
import { react } from '@smartestate/eslint-config/react';

export default defineConfig(
  // Generated from the OpenAPI document; regenerate instead of editing.
  globalIgnores(['src/shared/api/schema.d.ts']),
  react({ tsconfigRootDir: import.meta.dirname }),
);
