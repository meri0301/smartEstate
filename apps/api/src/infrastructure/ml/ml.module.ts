import { Global, Module } from '@nestjs/common';
import { MlClient } from './ml.client.js';

/**
 * Access to the Python ML service.
 *
 * Global because more than one feature will want it: valuation now, embeddings
 * and ranking later, and each would otherwise import the module again.
 */
@Global()
@Module({
  providers: [MlClient],
  exports: [MlClient],
})
export class MlModule {}
