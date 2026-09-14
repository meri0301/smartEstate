import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { InjectConfig, type AppConfig } from '../../config/app-config.js';

/**
 * Single Prisma Client for the process, driven by the `pg` adapter.
 * Geometry and vector columns are `Unsupported` in the schema, so repositories
 * that touch them use `$queryRaw` / `$executeRaw` through this same instance.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@InjectConfig() config: AppConfig) {
    super({
      adapter: new PrismaPg({ connectionString: config.databaseUrl }),
      log: config.nodeEnv === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
