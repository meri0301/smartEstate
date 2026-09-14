import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, loadConfig } from './app-config.js';

/**
 * Provides the validated `AppConfig` application-wide. Loading happens once,
 * when the module is instantiated, so an invalid environment aborts start-up.
 */
@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: (): ReturnType<typeof loadConfig> => loadConfig() },
  ],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
