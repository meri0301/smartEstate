import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsRepository } from './reviews.repository.js';
import { ReviewsService } from './reviews.service.js';
import { StatsRepository } from './stats.repository.js';

/**
 * Reviews are written from the landing page without an account. The admin
 * module comes in for the audit log: the one write here that anybody on the
 * internet can reach is the one most worth having a record of.
 */
@Module({
  imports: [AdminModule],
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewsRepository, StatsRepository],
  exports: [ReviewsService],
})
export class ReviewsModule {}
