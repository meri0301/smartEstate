import { defineConfig } from 'vitest/config';

/**
 * Two projects share one config so `vitest run` executes both while
 * `--project unit` / `--project integration` run them in isolation.
 *
 * - unit: pure logic with mocked collaborators; no I/O.
 * - integration: boots the real application against a disposable PostgreSQL
 *   (PostGIS + pgvector) started by Testcontainers, migrated and seeded once
 *   per run. Files run sequentially because they share that database.
 *
 * Decorator metadata (required by Nest's DI) is emitted from tsconfig.json
 * settings by Vite's TypeScript transform.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.spec.ts', 'prisma/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['test/integration/**/*.int-spec.ts'],
          globalSetup: ['test/integration/setup/global-setup.ts'],
          setupFiles: ['test/integration/setup/env.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'prisma/seed/lib/**/*.ts'],
      exclude: [
        'src/main.ts',
        'src/**/*.module.ts',
        'src/**/*.spec.ts',
        'src/generated/**',
        'src/openapi/export.ts',
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
