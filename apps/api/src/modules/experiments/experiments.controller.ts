import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Experiment, ExperimentResults } from '@smartestate/contracts';
import { Public } from '../../common/auth/decorators.js';
import {
  ExperimentDto,
  ExperimentKeyParamsDto,
  ExperimentResultsDto,
  ExperimentResultsQueryDto,
} from './experiments.dto.js';
import { ExperimentsService } from './experiments.service.js';

/**
 * Read-only. Experiments are defined in the database and their results are
 * aggregates with no personal data in them, so the page that shows them is
 * public: the evaluation chapter should be reproducible by anyone with the URL.
 */
@ApiTags('experiments')
@Controller('experiments')
export class ExperimentsController {
  constructor(private readonly experiments: ExperimentsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Every experiment, with its arms and allocation' })
  @ApiOkResponse({ type: [ExperimentDto] })
  list(): Promise<Experiment[]> {
    return this.experiments.list();
  }

  @Public()
  @Get(':key/results')
  @ApiOperation({
    summary: 'Per-arm outcomes for one experiment',
    description:
      'Click-through rate over every session, and precision@k and NDCG@k over sessions with feedback, with standard errors and the sample size beside each. Arms are compared with 95% Welch intervals only once every arm has reached the published minimum number of sessions; below it no comparison is offered rather than one with a caveat.',
  })
  @ApiOkResponse({ type: ExperimentResultsDto })
  @ApiNotFoundResponse({ description: 'Unknown experiment' })
  results(
    @Param() params: ExperimentKeyParamsDto,
    @Query() query: ExperimentResultsQueryDto,
  ): Promise<ExperimentResults> {
    return this.experiments.results(params.key, query.k);
  }
}
