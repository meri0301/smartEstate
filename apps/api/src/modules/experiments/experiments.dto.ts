import { experimentResultsSchema, experimentSchema } from '@smartestate/contracts';
import { z } from 'zod';
import { createZodDto } from '../../common/zod/zod-dto.js';

export class ExperimentDto extends createZodDto(experimentSchema, {
  name: 'ExperimentDto',
  io: 'output',
}) {}

export class ExperimentResultsDto extends createZodDto(experimentResultsSchema, {
  name: 'ExperimentResultsDto',
  io: 'output',
}) {}

export class ExperimentKeyParamsDto extends createZodDto(
  z.object({ key: z.string().min(1).max(64) }),
  { name: 'ExperimentKeyParamsDto' },
) {}

export class ExperimentResultsQueryDto extends createZodDto(
  z.object({
    /** The k for precision@k and NDCG@k. Defaults to the page size the recommender serves. */
    k: z.coerce.number().int().min(1).max(50).optional(),
  }),
  { name: 'ExperimentResultsQueryDto' },
) {}
