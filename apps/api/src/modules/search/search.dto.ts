import {
  hybridSearchBodySchema,
  hybridSearchResponseSchema,
  parseQueryBodySchema,
  parsedQuerySchema,
} from '@smartestate/contracts';
import { createZodDto } from '../../common/zod/zod-dto.js';

export class ParseQueryBodyDto extends createZodDto(parseQueryBodySchema, {
  name: 'ParseQueryBodyDto',
}) {}

export class ParsedQueryDto extends createZodDto(parsedQuerySchema, {
  name: 'ParsedQueryDto',
  io: 'output',
}) {}

export class HybridSearchBodyDto extends createZodDto(hybridSearchBodySchema, {
  name: 'HybridSearchBodyDto',
}) {}

export class HybridSearchResponseDto extends createZodDto(hybridSearchResponseSchema, {
  name: 'HybridSearchResponseDto',
  io: 'output',
}) {}
