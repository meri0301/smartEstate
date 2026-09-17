import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { RouteConfig } from '@nestjs/platform-fastify';
import {
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { ProductStats, Review, ReviewList } from '@smartestate/contracts';
import type { FastifyRequest } from 'fastify';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { CurrentUser, Public, Roles } from '../../common/auth/decorators.js';
import { WriteReviewRateLimit } from './review.rate-limit.js';
import {
  CreateReviewRequestDto,
  ProductStatsDto,
  ReviewDto,
  ReviewListDto,
  ReviewParamsDto,
  ReviewsQueryDto,
} from './reviews.dto.js';
import { ReviewsService } from './reviews.service.js';

@ApiTags('reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Published reviews, newest first',
    description:
      'Author names are text somebody typed. Nothing has verified them, and no review is joined to an account.',
  })
  @ApiOkResponse({ type: ReviewListDto })
  list(@Query() query: ReviewsQueryDto): Promise<ReviewList> {
    return this.reviews.list(query.limit);
  }

  @Public()
  @Get('stats')
  @ApiOperation({
    summary: 'What the product has actually done',
    description:
      'Counts taken from the database, so the landing page can state a figure that can be checked rather than one that cannot.',
  })
  @ApiOkResponse({ type: ProductStatsDto })
  stats(): Promise<ProductStats> {
    return this.reviews.productStats();
  }

  @Public()
  @RouteConfig(WriteReviewRateLimit)
  @Post()
  @ApiOperation({
    summary: 'Write a review',
    description:
      'Open by product decision: no account is needed and the review is published on submission. Rate limited per address, because an endpoint that publishes immediately and asks for no credentials is otherwise an open channel to the front page.',
  })
  @ApiOkResponse({ type: ReviewDto })
  create(@Body() body: CreateReviewRequestDto, @Req() request: FastifyRequest): Promise<Review> {
    return this.reviews.create(body, request.ip);
  }

  @Roles('MODERATOR', 'ADMIN')
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Take a review off the page',
    description:
      'Hides rather than deletes, so what was removed and who removed it survives in the audit log.',
  })
  @ApiNoContentResponse({ description: 'Hidden' })
  @ApiForbiddenResponse({ description: 'Moderators and administrators only' })
  @ApiNotFoundResponse({ description: 'Unknown, or already hidden' })
  hide(
    @Param() params: ReviewParamsDto,
    @CurrentUser() moderator: AuthenticatedUser,
  ): Promise<void> {
    return this.reviews.hide(params.id, moderator);
  }
}
