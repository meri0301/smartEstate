import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  LOCALES,
  type ListingDetail,
  type ListingSummary,
  type Page,
} from '@smartestate/contracts';
import type { FastifyRequest } from 'fastify';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { CurrentUser, Public, Roles } from '../../common/auth/decorators.js';
import { resolveLocale } from '../../common/locale/locale.js';
import {
  CreateListingBodyDto,
  ListingDetailDto,
  ListingLookupParamsDto,
  ListingParamsDto,
  ListingSearchQueryDto,
  ListingsPageDto,
  UpdateListingBodyDto,
} from './listings.dto.js';
import { ListingsService } from './listings.service.js';

/** Optional response-locale override, documented once and reused by every route that returns listing text. */
const LOCALE_QUERY = {
  name: 'locale',
  required: false,
  enum: LOCALES,
  description:
    'Response locale for listing texts; falls back to the account preference, then Accept-Language, then hy',
} as const;

@ApiTags('listings')
@Controller('listings')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Structured search with filters, sorting and cursor pagination' })
  @ApiOkResponse({ type: ListingsPageDto })
  search(
    @Query() query: ListingSearchQueryDto,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
  ): Promise<Page<ListingSummary>> {
    return this.listings.search(
      query,
      resolveLocale({ query: query.locale, userLocale: user?.locale, acceptLanguage }),
    );
  }

  @Public()
  @Get(':idOrPublicId')
  @ApiOperation({ summary: 'Listing detail by id or public id' })
  @ApiQuery(LOCALE_QUERY)
  @ApiOkResponse({ type: ListingDetailDto })
  @ApiNotFoundResponse({ description: 'Unknown, or not visible to the caller' })
  getOne(
    @Param() params: ListingLookupParamsDto,
    @Query('locale') locale: string | undefined,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
  ): Promise<ListingDetail> {
    return this.listings.getDetail(
      params.idOrPublicId,
      user,
      resolveLocale({ query: locale, userLocale: user?.locale, acceptLanguage }),
    );
  }

  @Post()
  @Roles('AGENT', 'MODERATOR', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish a listing for an existing building' })
  @ApiQuery(LOCALE_QUERY)
  @ApiCreatedResponse({ type: ListingDetailDto })
  @ApiForbiddenResponse({ description: 'Requires AGENT, MODERATOR or ADMIN' })
  create(
    @Body() body: CreateListingBodyDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Query('locale') locale: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
  ): Promise<ListingDetail> {
    return this.listings.create(
      body,
      user,
      request.ip,
      resolveLocale({ query: locale, userLocale: user.locale, acceptLanguage }),
    );
  }

  @Patch(':id')
  @Roles('AGENT', 'MODERATOR', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update attributes, status or translations of an own listing' })
  @ApiQuery(LOCALE_QUERY)
  @ApiOkResponse({ type: ListingDetailDto })
  @ApiForbiddenResponse({ description: 'Not the owner and not a moderator' })
  update(
    @Param() params: ListingParamsDto,
    @Body() body: UpdateListingBodyDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Query('locale') locale: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
  ): Promise<ListingDetail> {
    return this.listings.update(
      params.id,
      body,
      user,
      request.ip,
      resolveLocale({ query: locale, userLocale: user.locale, acceptLanguage }),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('AGENT', 'MODERATOR', 'ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Withdraw a listing (soft delete)' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Not the owner and not a moderator' })
  withdraw(
    @Param() params: ListingParamsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.listings.withdraw(params.id, user, request.ip);
  }
}
