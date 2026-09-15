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
import { LOCALES, type ParsedQuery } from '@smartestate/contracts';
import type { FastifyRequest } from 'fastify';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { CurrentUser, Public } from '../../common/auth/decorators.js';
import { resolveLocale } from '../../common/locale/locale.js';
import { AiRateLimit } from '../../common/rate-limit/ai.rate-limit.js';
import { ParsedQueryDto, ParseQueryBodyDto } from './search.dto.js';
import { QueryParserService } from './query-parser.service.js';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly parser: QueryParserService) {}

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
}
