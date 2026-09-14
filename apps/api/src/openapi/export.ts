/**
 * Writes the OpenAPI document to docs/api/openapi.json.
 *
 *   pnpm openapi:export
 *
 * Boots the application (which connects to the database) but never listens.
 * Runs from the compiled output: NestJS dependency injection needs the decorator
 * metadata that `tsc` emits and esbuild-based runners (tsx) drop.
 * CI regenerates the file and fails when the committed copy is stale.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createApp } from '../app.factory.js';
import { loadRootEnv } from '../config/load-env.js';
import { buildOpenApiDocument } from './openapi.js';

const OUTPUT = path.resolve(import.meta.dirname, '../../../../docs/api/openapi.json');

loadRootEnv();
process.env.SWAGGER_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';

const app = await createApp();
try {
  await app.init();
  const document = buildOpenApiDocument(app);
  mkdirSync(path.dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  console.info(`openapi: ${String(Object.keys(document.paths).length)} paths written to ${OUTPUT}`);
} finally {
  await app.close();
}
