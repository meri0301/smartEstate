/**
 * The mortgage refund, assembled.
 *
 * Thin on purpose: it reads the rules and the place, hands both to a pure
 * function, and returns what comes back. Everything worth arguing about is in
 * `refund-calculator.ts` where it can be tested without a database, and
 * everything that changes with the law is in a row.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import type { MortgageRefund, MortgageRefundRequest } from '@smartestate/contracts';
import { InjectConfig, type AppConfig } from '../../config/app-config.js';
import { MortgageRepository } from './mortgage.repository.js';
import { calculateRefund } from './refund-calculator.js';
import { ruleSetFor } from './refund-rules.js';

@Injectable()
export class MortgageService {
  constructor(
    @InjectConfig() private readonly config: AppConfig,
    private readonly repository: MortgageRepository,
  ) {}

  async refund(request: MortgageRefundRequest): Promise<MortgageRefund> {
    const location = await this.repository.location(request.districtSlug);
    if (location === undefined) {
      // A district nobody has heard of is a bad request rather than a refund of
      // zero: answering it would be answering a question about nowhere.
      throw new NotFoundException({ message: 'Unknown district', code: 'NOT_FOUND' });
    }

    const sets = await this.repository.ruleSets();
    // Selected by the agreement date, not by today: which cap applies is a
    // property of the loan, so an answer stays the same after the law changes.
    const ruleSet = ruleSetFor(sets, new Date(`${request.agreementDate}T00:00:00Z`));

    return calculateRefund({
      request,
      location,
      ruleSet,
      ...(this.config.mortgage.incomeTaxRatePct === undefined
        ? {}
        : { incomeTaxRatePct: this.config.mortgage.incomeTaxRatePct }),
      now: new Date(),
    });
  }
}
