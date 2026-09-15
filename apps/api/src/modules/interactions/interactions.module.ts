import { Module } from '@nestjs/common';
import { InteractionsController } from './interactions.controller.js';
import { InteractionsService } from './interactions.service.js';

/**
 * Implicit feedback. Written from the first day so that when a learned ranker
 * needs training data, or the evaluation chapter needs outcomes, both already
 * exist rather than starting the day somebody remembers.
 */
@Module({
  controllers: [InteractionsController],
  providers: [InteractionsService],
})
export class InteractionsModule {}
