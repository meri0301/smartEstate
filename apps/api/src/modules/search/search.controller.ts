import { Body, Controller, Headers, HttpCode, Post, Query, Req } from '@nestjs/common';
import { RouteConfig } from '@nestjs/platform-fastify';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { LOCALES, type HybridSearchResponse, type ParsedQuery } from '@smartestate/contracts';
import type { FastifyRequest } from 'fastify';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { CurrentUser, Public } from '../../common/auth/decorators.js';
import { resolveLocale } from '../../common/locale/locale.js';
import { AiRateLimit } from '../../common/rate-limit/ai.rate-limit.js';
import { HybridSearchService } from './hybrid-search.service.js';
import {
  HybridSearchBodyDto,
  HybridSearchResponseDto,
  ParsedQueryDto,
  ParseQueryBodyDto,
} from './search.dto.js';
import { QueryParserService } from './query-parser.service.js';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(
    private readonly parser: QueryParserService,
    private readonly hybrid: HybridSearchService,
  ) {}

  @Public()
  @Post('parse')
  // Nothing is created: the answer is a reading of the request, not a resource.
  @HttpCode(200)
  @RouteConfig(AiRateLimit)
  @ApiOperation({
    summary: 'Turn a sentence into search filters',
    description:
      'Returns the filters that were understood and the phrases that were not. The result is never applied automatically: the caller shows it and lets the reader correct it.',
  })
  @ApiQuery({ name: 'locale', required: false, enum: LOCALES })
  @ApiBody({ type: ParseQueryBodyDto })
  @ApiOkResponse({ type: ParsedQueryDto })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  parse(
    @Body() body: ParseQueryBodyDto,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() _request: FastifyRequest,
    @Query('locale') locale: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
  ): Promise<ParsedQuery> {
    return this.parser.parse(
      body.query,
      resolveLocale({ query: locale, userLocale: user?.locale, acceptLanguage }),
    );
  }

  @Public()
  @Post('hybrid')
  // A search is a reading of the catalogue, not a resource being created.
  @HttpCode(200)
  // It may embed the query, which spends the shared model allowance.
  @RouteConfig(AiRateLimit)
  @ApiOperation({
    summary: 'Search by sentence: filters, words and meaning, fused',
    description:
      'Parses the sentence into filters, ranks the listings that pass them by full-text match and by embedding similarity, and fuses the two rankings with reciprocal rank fusion. Every result reports where each arm placed it. Without an embedding index or a model service the search runs lexically and says so.',
  })
  @ApiQuery({ name: 'locale', required: false, enum: LOCALES })
  @ApiBody({ type: HybridSearchBodyDto })
  @ApiOkResponse({ type: HybridSearchResponseDto })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  hybridSearch(
    @Body() body: HybridSearchBodyDto,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query('locale') locale: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
  ): Promise<HybridSearchResponse> {
    return this.hybrid.search(
      body,
      resolveLocale({ query: locale, userLocale: user?.locale, acceptLanguage }),
    );
  }
}
