import path from 'node:path';

/**
 * Loads the monorepo-root `.env` into `process.env` for local development.
 * Existing variables win, so CI and containers that inject configuration
 * directly are unaffected; a missing file is not an error.
 */
export function loadRootEnv(fromDirectory: string = import.meta.dirname): void {
  // src/config or dist/config → apps/api → apps → repo root
  const candidates = [
    path.resolve(fromDirectory, '../../../../.env'),
    path.resolve(fromDirectory, '../../../.env'),
  ];
  for (const file of candidates) {
    try {
      process.loadEnvFile(file);
      return;
    } catch {
      // try the next candidate
    }
  }
}
