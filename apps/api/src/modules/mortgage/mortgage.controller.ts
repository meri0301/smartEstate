import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { MortgageRefund } from '@smartestate/contracts';
import { Public } from '../../common/auth/decorators.js';
import { MortgageRefundRequestDto, MortgageRefundResponseDto } from './mortgage.dto.js';
import { MortgageService } from './mortgage.service.js';

@ApiTags('mortgage')
@Controller('mortgage')
export class MortgageController {
  constructor(private readonly mortgage: MortgageService) {}

  @Public()
  @Post('refund')
  // A calculation over the request, not a resource being created.
  @HttpCode(200)
  @ApiOperation({
    summary: 'What the income-tax refund on this mortgage would be',
    description:
      'Armenia refunds the personal income tax a buyer pays, up to the mortgage interest they pay, up to a quarterly cap. The rules are stored as effective-dated rows and selected by the loan agreement date, so an answer stays reproducible after the law changes, and the response names the rule set that produced it. When a buyer does not qualify, every failed condition is returned as a translatable code together with what the refund would have been. Every figure is an estimate from public information and not tax advice.',
  })
  @ApiBody({ type: MortgageRefundRequestDto })
  @ApiOkResponse({ type: MortgageRefundResponseDto })
  @ApiNotFoundResponse({ description: 'Unknown district' })
  refund(@Body() body: MortgageRefundRequestDto): Promise<MortgageRefund> {
    return this.mortgage.refund(body);
  }
}
