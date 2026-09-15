import { alternativesQuerySchema, alternativesResponseSchema } from '@smartestate/contracts';
import { createZodDto } from '../../common/zod/zod-dto.js';

export class AlternativesQueryDto extends createZodDto(alternativesQuerySchema, {
  name: 'AlternativesQueryDto',
}) {}

export class AlternativesResponseDto extends createZodDto(alternativesResponseSchema, {
  name: 'AlternativesResponseDto',
  io: 'output',
}) {}
