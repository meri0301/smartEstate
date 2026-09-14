/**
 * Vitest global setup for the integration project: one disposable PostgreSQL
 * with PostGIS and pgvector for the whole run, built from the same Dockerfile
 * as the development database, then migrated and seeded exactly like `docker
 * compose up` + `pnpm db:migrate` + `pnpm db:seed`.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer } from 'testcontainers';
import type { TestProject } from 'vitest/node';
import { runSeed } from '../../../prisma/seed/run.js';

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

const IMAGE_TAG = 'smartestate/postgres:test';
const API_DIR = path.resolve(import.meta.dirname, '../../..');
const REPO_ROOT = path.resolve(API_DIR, '../..');

let container: StartedPostgreSqlContainer | undefined;

export async function setup(project: TestProject): Promise<void> {
  const startedAt = Date.now();
  await GenericContainer.fromDockerfile(path.join(REPO_ROOT, 'docker/postgres')).build(IMAGE_TAG, {
    deleteOnExit: false,
  });
  container = await new PostgreSqlContainer(IMAGE_TAG)
    .withDatabase('smartestate_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  const databaseUrl = `${container.getConnectionUri()}?schema=public`;
  execFileSync(
    process.execPath,
    [path.join(API_DIR, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    {
      cwd: API_DIR,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    },
  );
  await runSeed(databaseUrl, { quiet: true });

  project.provide('databaseUrl', databaseUrl);
  console.info(`integration: database ready in ${String(Date.now() - startedAt)} ms`);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
