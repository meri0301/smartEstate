import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module.js';

/**
 * Composition root of the modular monolith. Every feature module from
 * `src/modules/*` is registered here and nowhere else, so the dependency graph
 * between bounded contexts is visible in a single file.
 */
@Module({
  imports: [HealthModule],
})
export class AppModule {}
