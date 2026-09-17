import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { ValuationQuote } from '@smartestate/contracts';
import { Public } from '../../common/auth/decorators.js';
import { ValuationQuoteRequestDto, ValuationQuoteDto } from './valuation.dto.js';
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
}
