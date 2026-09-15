import { valuationSchema } from '@smartestate/contracts';
import { createZodDto } from '../../common/zod/zod-dto.js';

export class ValuationDto extends createZodDto(valuationSchema, {
  name: 'ValuationDto',
  io: 'output',
}) {}
