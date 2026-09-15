import { Module } from '@nestjs/common';
import { ExperimentsController } from './experiments.controller.js';
import { ExperimentsRepository } from './experiments.repository.js';
import { ExperimentsService } from './experiments.service.js';

/**
 * The A/B harness.
 *
 * Exported so the recommender can ask which arm to serve; it depends on nothing
 * but the database, so it can be imported by anything without a cycle. The
 * results it computes are read from tables other modules write — sessions from
 * the recommender, interactions from the interactions module — and it owns none
 * of them.
 */
@Module({
  controllers: [ExperimentsController],
  providers: [ExperimentsService, ExperimentsRepository],
  exports: [ExperimentsService],
})
export class ExperimentsModule {}
