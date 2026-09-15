import { parsedQuerySchema, parseQueryBodySchema } from '@smartestate/contracts';
import { createZodDto } from '../../common/zod/zod-dto.js';

export class ParseQueryBodyDto extends createZodDto(parseQueryBodySchema, {
  name: 'ParseQueryBodyDto',
}) {}

export class ParsedQueryDto extends createZodDto(parsedQuerySchema, {
  name: 'ParsedQueryDto',
  io: 'output',
}) {}
