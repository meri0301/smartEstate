import 'reflect-metadata';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { APP_CONFIG, type AppConfig } from './config/app-config.js';
import { buildOpenApiDocument, setupSwagger } from './openapi/openapi.js';

/** Route prefix for every endpoint except the health probes. */
export const API_PREFIX = 'api';

/**
 * Builds the fully configured application without starting to listen, so the
 * same setup serves `main.ts`, the OpenAPI export and the integration tests.
 */
export async function createApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
    { bufferLogs: true },
  );
  const config = app.get<AppConfig>(APP_CONFIG);
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();

  // Swagger UI needs inline scripts; the API itself serves JSON only, so CSP is
  // deferred to the hardening phase, where the docs route gets its own policy.
  await app.register(fastifyHelmet, { contentSecurityPolicy: false });
  await app.register(fastifyCookie);
  if (config.rateLimit.enabled) {
    await app.register(fastifyRateLimit, {
      max: config.rateLimit.perMinute,
      timeWindow: '1 minute',
    });
  }
  app.enableCors({ origin: [...config.corsOrigins], credentials: true });
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health', 'health/ready'] });

  if (config.swaggerEnabled) {
    setupSwagger(app, buildOpenApiDocument(app));
  }
  return app;
}
