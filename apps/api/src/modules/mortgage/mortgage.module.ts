import { Module } from '@nestjs/common';
import { MortgageController } from './mortgage.controller.js';
import { MortgageRepository } from './mortgage.repository.js';
import { MortgageService } from './mortgage.service.js';

/**
 * The mortgage income-tax refund.
 *
 * It owns the rule rows and nothing else. No listing is required to ask the
 * question — a buyer works out what they can afford before they pick a flat —
 * so this module depends on neither listings nor the model service.
 */
@Module({
  controllers: [MortgageController],
  providers: [MortgageService, MortgageRepository],
  exports: [MortgageService],
})
export class MortgageModule {}
