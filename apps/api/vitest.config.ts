import { defineConfig } from 'vitest/config';

/**
 * Two projects share one config so `vitest run` executes both while
 * `--project unit` / `--project e2e` still run them in isolation.
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
          name: 'e2e',
          environment: 'node',
          include: ['test/**/*.e2e-spec.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'prisma/seed/lib/**/*.ts'],
      exclude: ['src/main.ts', 'src/**/*.module.ts', 'src/**/*.spec.ts', 'src/generated/**'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
