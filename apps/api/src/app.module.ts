import type { IncomingMessage } from 'node:http';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { LoggerModule, type Params } from 'nestjs-pino';
import { JwtAuthGuard } from './common/auth/jwt-auth.guard.js';
import { RolesGuard } from './common/auth/roles.guard.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { ZodValidationPipe } from './common/zod/zod-validation.pipe.js';
import { APP_CONFIG, type AppConfig } from './config/app-config.js';
import { ConfigModule } from './config/config.module.js';
import { LlmModule } from './infrastructure/llm/llm.module.js';
import { MlModule } from './infrastructure/ml/ml.module.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { RedisModule } from './infrastructure/redis/redis.module.js';
import { AlternativesModule } from './modules/alternatives/alternatives.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { GeoModule } from './modules/geo/geo.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { ListingsModule } from './modules/listings/listings.module.js';
import { MortgageModule } from './modules/mortgage/mortgage.module.js';
import { RecommendationsModule } from './modules/recommendations/recommendations.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { ValuationModule } from './modules/valuation/valuation.module.js';

function loggerParams(config: AppConfig): Params {
  return {
    pinoHttp: {
      level: config.logLevel,
      // Never write credentials to logs.
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        censor: '[redacted]',
      },
      autoLogging: {
        ignore: (req: IncomingMessage) => req.url?.startsWith('/health') ?? false,
      },
      ...(config.nodeEnv === 'development'
        ? {
            transport: {
              target: 'pino-pretty',
              options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' },
            },
          }
        : {}),
    },
  };
}

/**
 * Composition root of the modular monolith. Every feature module from
 * `src/modules/*` is registered here and nowhere else, so the dependency graph
 * between bounded contexts is visible in a single file. Cross-cutting behaviour
 * (validation, authentication, authorisation, error shaping) is installed
 * globally so no controller can forget it.
 */
@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({ inject: [APP_CONFIG], useFactory: loggerParams }),
    PrismaModule,
    RedisModule,
    MlModule,
    LlmModule,
    AdminModule,
    AlternativesModule,
    AuthModule,
    UsersModule,
    GeoModule,
    ListingsModule,
    MortgageModule,
    ValuationModule,
    RecommendationsModule,
    SearchModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
