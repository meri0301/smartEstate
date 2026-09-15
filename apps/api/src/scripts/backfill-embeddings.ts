/**
 * `pnpm embeddings:backfill` — build or rebuild the vector index.
 *
 * A command rather than an endpoint. Embedding the whole catalogue is an
 * operator's decision with a real cost in time, and putting it behind an HTTP
 * route would mean either a request that runs for minutes or a job system this
 * project does not need. Listings published from now on embed themselves; this
 * is for the first run, for a model change, and after a reseed.
 *
 * It boots the application context rather than talking to the database directly,
 * so it uses the same configuration, the same client and the same service the
 * API uses. A backfill that embedded text differently from the running product
 * would produce an index that quietly disagrees with it.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { loadRootEnv } from '../config/load-env.js';
import { MlUnavailableError } from '../infrastructure/ml/ml.client.js';
import { EmbeddingsService } from '../modules/embeddings/embeddings.service.js';

async function main(): Promise<void> {
  // The same root .env the API and the OpenAPI export read, so a backfill run
  // from the repository root needs no environment of its own.
  loadRootEnv();
  const context = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const embeddings = context.get(EmbeddingsService);
    const report = await embeddings.backfill();

    process.stdout.write(
      [
        '',
        `model            ${report.modelVersion}`,
        `embedded         ${String(report.embedded)}`,
        `already current  ${String(report.skipped)}`,
        `no text          ${String(report.withoutText)}`,
        `removed stale    ${String(report.removedStale)}`,
        '',
      ].join('\n'),
    );

    const counts = await embeddings.countByModel();
    for (const { modelVersion, count } of counts) {
      process.stdout.write(`index: ${String(count)} vectors from ${modelVersion}\n`);
    }
  } finally {
    await context.close();
  }
}

main().catch((error: unknown) => {
  // A missing model service is the ordinary failure here, and it deserves an
  // instruction rather than a stack trace: the fix is to start the container.
  if (error instanceof MlUnavailableError) {
    process.stderr.write(`${error.message}\nStart it with \`docker compose up ml\`.\n`);
    process.exitCode = 1;
    return;
  }
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
