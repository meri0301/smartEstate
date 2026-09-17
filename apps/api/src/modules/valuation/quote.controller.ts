import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { ModelAccuracy, ValuationQuote } from '@smartestate/contracts';
import { Public } from '../../common/auth/decorators.js';
import { ModelAccuracyDto, ValuationQuoteRequestDto, ValuationQuoteDto } from './valuation.dto.js';
import { QuoteService } from './quote.service.js';

@ApiTags('valuation')
@Controller('valuation')
export class QuoteController {
  constructor(private readonly quotes: QuoteService) {}

  @Public()
  @Post('quote')
  @ApiOperation({
    summary: 'What a property is worth, without it being a listing',
    description:
      'Values a property from its own details. Nothing is stored. Fields the reader leaves blank are filled from the district’s published stock and reported in assumptions, so no figure rests on a substitution the reader cannot see.',
  })
  @ApiOkResponse({ type: ValuationQuoteDto })
  @ApiBadRequestResponse({ description: 'Unknown district, or details out of range' })
  @ApiServiceUnavailableResponse({ description: 'No model is deployed' })
  quote(@Body() body: ValuationQuoteRequestDto): Promise<ValuationQuote> {
    return this.quotes.quote(body);
  }

  @Public()
  @Get('model')
  @ApiOperation({
    summary: 'What the model measured about itself',
    description:
      'The cross-validation the model reports, so a published accuracy figure is the one it actually scored rather than a number typed into the copy that goes stale on the next retrain. Two error figures: one holding out listings, one holding out whole districts.',
  })
  @ApiOkResponse({ type: ModelAccuracyDto })
  @ApiServiceUnavailableResponse({ description: 'No model is deployed' })
  accuracy(): Promise<ModelAccuracy> {
    return this.quotes.accuracy();
  }
}
