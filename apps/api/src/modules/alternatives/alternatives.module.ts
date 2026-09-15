import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module.js';
import { AlternativesController } from './alternatives.controller.js';
import { AlternativesService } from './alternatives.service.js';

/**
 * The "better option" engine.
 *
 * It owns no data of its own: the comparison is computed from listings the
 * listings module already returns, and the estimates come from the model client.
 * That is deliberate — a dominance claim has to be about the same listings the
 * rest of the product shows, and a second read path would eventually disagree
 * with the first.
 */
@Module({
  imports: [ListingsModule],
  controllers: [AlternativesController],
  providers: [AlternativesService],
  exports: [AlternativesService],
})
export class AlternativesModule {}
