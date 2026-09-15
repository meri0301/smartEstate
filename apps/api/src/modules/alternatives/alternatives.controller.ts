import { Controller, Get, Headers, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { LOCALES, type AlternativesResponse } from '@smartestate/contracts';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { CurrentUser, Public } from '../../common/auth/decorators.js';
import { resolveLocale } from '../../common/locale/locale.js';
import { ListingParamsDto } from '../listings/listings.dto.js';
import { AlternativesQueryDto } from './alternatives.dto.js';
import { AlternativesResponseDto } from './alternatives.dto.js';
import { AlternativesService } from './alternatives.service.js';

@ApiTags('alternatives')
@Controller('listings')
export class AlternativesController {
  constructor(private readonly alternatives: AlternativesService) {}

  @Public()
  @Get(':id/alternatives')
  @ApiOperation({
    summary: 'Better options than this listing, and what each one costs you',
    description:
      'Compares listings a buyer could actually switch to — same district, at least as many rooms, no more than a tenth dearer — against this one, on price, area, condition, the building and the floor, plus location when an anchor is given and value when the model service answers. An alternative that is better on something and worse on nothing dominates it; the rest are trade-offs, and every comparison carries both figures so the claim can be checked.',
  })
  @ApiQuery({ name: 'locale', required: false, enum: LOCALES })
  @ApiOkResponse({ type: AlternativesResponseDto })
  @ApiNotFoundResponse({ description: 'Unknown, or not visible to the caller' })
  forListing(
    @Param() params: ListingParamsDto,
    @Query() query: AlternativesQueryDto,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query('locale') locale: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
  ): Promise<AlternativesResponse> {
    return this.alternatives.forListing(
      params.id,
      user,
      query,
      resolveLocale({ query: locale, userLocale: user?.locale, acceptLanguage }),
    );
  }
}
