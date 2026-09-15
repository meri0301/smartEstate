import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service.js';

/**
 * Global because caching is cross-cutting and optional: a feature that wants a
 * cache should not have to import a module to find out it is not there.
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
