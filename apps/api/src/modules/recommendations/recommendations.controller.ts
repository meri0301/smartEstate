import { Body, Controller, Headers, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { LOCALES, type RecommendationResponse } from '@smartestate/contracts';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { CurrentUser, Public } from '../../common/auth/decorators.js';
import { resolveLocale } from '../../common/locale/locale.js';
import { RecommendationRequestDto, RecommendationResponseDto } from './recommendations.dto.js';
import { RecommendationsService } from './recommendations.service.js';

@ApiTags('recommendations')
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Public()
  @Post()
  // A ranking is a computation over the catalogue, not a new resource, so the
  // body-carrying verb does not imply 201.
  @HttpCode(200)
  @ApiOperation({
    summary: 'Rank listings against a buyer’s stated preferences',
    description:
      'Hard limits filter the catalogue; the remainder are scored on each criterion and combined by the chosen method. Every run is stored so rankings can be compared later.',
  })
  @ApiQuery({
    name: 'locale',
    required: false,
    enum: LOCALES,
    description: 'Response locale for listing texts',
  })
  @ApiBody({ type: RecommendationRequestDto })
  @ApiOkResponse({ type: RecommendationResponseDto })
  recommend(
    @Body() body: RecommendationRequestDto,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query('locale') locale: string | undefined,
    @Headers('accept-language') acceptLanguage: string | undefined,
  ): Promise<RecommendationResponse> {
    return this.recommendations.recommend(
      body,
      user,
      resolveLocale({ query: locale, userLocale: user?.locale, acceptLanguage }),
    );
  }
}
