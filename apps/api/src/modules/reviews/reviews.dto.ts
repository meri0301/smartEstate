import {
  createReviewRequestSchema,
  productStatsSchema,
  reviewListSchema,
  reviewSchema,
  reviewsQuerySchema,
  uuidSchema,
} from '@smartestate/contracts';
import { z } from 'zod';
import { createZodDto } from '../../common/zod/zod-dto.js';

export class CreateReviewRequestDto extends createZodDto(createReviewRequestSchema, {
  name: 'CreateReviewRequestDto',
  io: 'input',
}) {}

export class ReviewDto extends createZodDto(reviewSchema, {
  name: 'ReviewDto',
  io: 'output',
}) {}

export class ReviewListDto extends createZodDto(reviewListSchema, {
  name: 'ReviewListDto',
  io: 'output',
}) {}

export class ReviewsQueryDto extends createZodDto(reviewsQuerySchema, {
  name: 'ReviewsQueryDto',
  io: 'input',
}) {}

export class ProductStatsDto extends createZodDto(productStatsSchema, {
  name: 'ProductStatsDto',
  io: 'output',
}) {}

export class ReviewParamsDto extends createZodDto(z.object({ id: uuidSchema }), {
  name: 'ReviewParamsDto',
}) {}
