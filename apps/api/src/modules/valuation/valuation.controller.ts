import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Valuation } from '@smartestate/contracts';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { CurrentUser, Public } from '../../common/auth/decorators.js';
import { ListingParamsDto } from '../listings/listings.dto.js';
import { ValuationDto } from './valuation.dto.js';
import { ValuationService } from './valuation.service.js';

@ApiTags('valuation')
@Controller('listings')
export class ValuationController {
  constructor(private readonly valuation: ValuationService) {}

  @Public()
  @Get(':id/valuation')
  @ApiOperation({
    summary: 'What the model thinks this listing is worth, and why',
    description:
      'Every figure comes from the model or the database. A stored valuation is reused while the listing is unchanged, and served with isStale set when the model cannot be reached to refresh it.',
  })
  @ApiOkResponse({ type: ValuationDto })
  @ApiNotFoundResponse({ description: 'Unknown, or not visible to the caller' })
  @ApiServiceUnavailableResponse({
    description: 'No model is deployed and nothing has been valued before',
  })
  forListing(
    @Param() params: ListingParamsDto,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<Valuation> {
    return this.valuation.forListing(params.id, user);
  }
}
