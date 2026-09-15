import { recommendationRequestSchema, recommendationResponseSchema } from '@smartestate/contracts';
import { createZodDto } from '../../common/zod/zod-dto.js';

export class RecommendationRequestDto extends createZodDto(recommendationRequestSchema, {
  name: 'RecommendationRequestDto',
}) {}

export class RecommendationResponseDto extends createZodDto(recommendationResponseSchema, {
  name: 'RecommendationResponseDto',
  io: 'output',
}) {}
