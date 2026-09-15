import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module.js';
import { ExplanationsService } from './explanations.service.js';
import { RecommendationsController } from './recommendations.controller.js';
import { RecommendationsRepository } from './recommendations.repository.js';
import { RecommendationsService } from './recommendations.service.js';

/**
 * Ranking reads the catalogue through the listings repository, never its own
 * query. The language model layer is global, so phrasing the reasons needs no
 * import here beyond the service that owns the prompt.
 */
@Module({
  imports: [ListingsModule],
  controllers: [RecommendationsController],
  providers: [RecommendationsService, RecommendationsRepository, ExplanationsService],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
