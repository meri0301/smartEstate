import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module.js';
import { ValuationController } from './valuation.controller.js';
import { ValuationRepository } from './valuation.repository.js';
import { ValuationService } from './valuation.service.js';

/**
 * Valuation reads listings through the listings module's repository rather than
 * querying them again, so the two can never disagree about what a listing is.
 */
@Module({
  imports: [ListingsModule],
  controllers: [ValuationController],
  providers: [ValuationService, ValuationRepository],
  exports: [ValuationService],
})
export class ValuationModule {}
