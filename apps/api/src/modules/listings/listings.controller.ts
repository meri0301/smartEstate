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
  ApiConflictResponse,
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
  ListingTransitionBodyDto,
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
  @ApiOperation({
    summary: 'Structured search with filters, sorting and cursor pagination',
    description:
      'Returns published listings. With mine=true it returns the caller’s own listings in any status; moderators may filter by any status.',
  })
  @ApiOkResponse({ type: ListingsPageDto })
  search(
    @Query() query: ListingSearchQueryDto,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
  ): Promise<Page<ListingSummary>> {
    return this.listings.search(
      query,
      user,
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
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a listing for an existing building',
    description:
      'Any signed-in account may create one. A regular user’s listing enters the review queue; a verified agent’s is published immediately.',
  })
  @ApiQuery(LOCALE_QUERY)
  @ApiCreatedResponse({ type: ListingDetailDto })
  @ApiConflictResponse({ description: 'The account already holds its maximum of live listings' })
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
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update attributes or translations of a listing',
    description: 'Status is not editable here; use the transitions endpoint.',
  })
  @ApiQuery(LOCALE_QUERY)
  @ApiOkResponse({ type: ListingDetailDto })
  @ApiForbiddenResponse({ description: 'Not the owner' })
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

  @Post(':id/transitions')
  // A transition changes an existing listing; it does not create a resource.
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Move a listing through the moderation lifecycle',
    description:
      'SUBMIT, PUBLISH, APPROVE, REJECT, REVISE and ARCHIVE. A transition that is not legal from the current status is a conflict, not a bad request.',
  })
  @ApiQuery(LOCALE_QUERY)
  @ApiOkResponse({ type: ListingDetailDto })
  @ApiForbiddenResponse({ description: 'The caller may not perform this transition' })
  @ApiConflictResponse({ description: 'Illegal from the listing’s current status' })
  transition(
    @Param() params: ListingParamsDto,
    @Body() body: ListingTransitionBodyDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
    @Query('locale') locale: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
  ): Promise<ListingDetail> {
    return this.listings.transition(
      params.id,
      body,
      user,
      request.ip,
      resolveLocale({ query: locale, userLocale: user.locale, acceptLanguage }),
    );
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Archive a listing (soft delete)' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Not the owner and not a moderator' })
  archive(
    @Param() params: ListingParamsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.listings.archive(params.id, user, request.ip);
  }

  @Delete(':id/permanent')
  @HttpCode(204)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete a listing and all of its history, permanently',
    description: 'Administrators only. Archiving is the reversible option.',
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Requires ADMIN' })
  destroy(
    @Param() params: ListingParamsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() request: FastifyRequest,
  ): Promise<void> {
    return this.listings.destroy(params.id, user, request.ip);
  }
}
