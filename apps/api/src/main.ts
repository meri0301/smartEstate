import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';

const DEFAULT_PORT = 3000;

/** Binding to all interfaces is required for the process to be reachable inside Docker. */
const LISTEN_HOST = '0.0.0.0';

function resolvePort(rawValue: string | undefined): number {
  const parsed = Number.parseInt(rawValue ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65_536 ? parsed : DEFAULT_PORT;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  app.enableShutdownHooks();
  await app.listen(resolvePort(process.env.API_PORT), LISTEN_HOST);
}

await bootstrap();
