import { mortgageRefundRequestSchema, mortgageRefundSchema } from '@smartestate/contracts';
import { createZodDto } from '../../common/zod/zod-dto.js';

export class MortgageRefundRequestDto extends createZodDto(mortgageRefundRequestSchema, {
  name: 'MortgageRefundRequestDto',
}) {}

export class MortgageRefundResponseDto extends createZodDto(mortgageRefundSchema, {
  name: 'MortgageRefundResponseDto',
  io: 'output',
}) {}
