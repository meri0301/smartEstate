import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module.js';
import { RecommendationsController } from './recommendations.controller.js';
import { RecommendationsRepository } from './recommendations.repository.js';
import { RecommendationsService } from './recommendations.service.js';

/** Ranking reads the catalogue through the listings repository, never its own query. */
@Module({
  imports: [ListingsModule],
  controllers: [RecommendationsController],
  providers: [RecommendationsService, RecommendationsRepository],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}
