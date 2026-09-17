import {
  valuationQuoteRequestSchema,
  valuationQuoteSchema,
  valuationSchema,
} from '@smartestate/contracts';
import { createZodDto } from '../../common/zod/zod-dto.js';

export class ValuationDto extends createZodDto(valuationSchema, {
  name: 'ValuationDto',
  io: 'output',
}) {}

export class ValuationQuoteRequestDto extends createZodDto(valuationQuoteRequestSchema, {
  name: 'ValuationQuoteRequestDto',
  io: 'input',
}) {}

export class ValuationQuoteDto extends createZodDto(valuationQuoteSchema, {
  name: 'ValuationQuoteDto',
  io: 'output',
}) {}
