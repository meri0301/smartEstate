import { Global, Module } from '@nestjs/common';
import { LlmService } from './llm.service.js';

/**
 * The single door to a language model.
 *
 * Global, and exporting only the service: a feature must not be able to reach a
 * provider directly, because the fallback, the cache, the quota and the trace
 * all live in the service and bypassing it would bypass all four.
 */
@Global()
@Module({
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
