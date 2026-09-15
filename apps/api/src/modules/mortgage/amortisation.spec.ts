import { describe, expect, it } from 'vitest';
import {
  amortise,
  monthlyPayment,
  quarterlyInterest,
  rateForTotalInterest,
  totalInterest,
} from './amortisation.js';

const loan = { principalAmd: 30_000_000, annualRatePct: 12, termYears: 20 };

describe('monthlyPayment', () => {
  it('matches the annuity formula on a textbook case', () => {
    // 100,000 at 6% over 30 years is 599.55 in every mortgage calculator there
    // has ever been. If this number moves, the formula is wrong, not the test.
    const payment = monthlyPayment({
      principalAmd: 100_000,
      annualRatePct: 6,
      termYears: 30,
    });

    expect(payment).toBeCloseTo(599.55, 1);
  });

  it('divides the principal evenly when there is no interest', () => {
    // The annuity formula divides by zero here, so the case is handled apart.
    expect(monthlyPayment({ principalAmd: 1_200, annualRatePct: 0, termYears: 1 })).toBe(100);
  });
});

describe('amortise', () => {
  it('produces one row per month of the term', () => {
    expect(amortise(loan)).toHaveLength(240);
  });

  it('closes at exactly zero', () => {
    // A schedule that does not close is the first thing a reader checks.
    expect(amortise(loan).at(-1)?.balanceAmd).toBe(0);
  });

  it('pays mostly interest at the start and mostly principal at the end', () => {
    const schedule = amortise(loan);
    const first = schedule[0];
    const last = schedule.at(-1);

    expect(first?.interestAmd).toBeGreaterThan(first?.principalAmd ?? 0);
    expect(last?.principalAmd).toBeGreaterThan(last?.interestAmd ?? 0);
  });

  it('charges the first month exactly one month of interest on the whole principal', () => {
    const schedule = amortise(loan);

    expect(schedule[0]?.interestAmd).toBeCloseTo((30_000_000 * 0.12) / 12, 6);
  });

  it('never lets the interest rise', () => {
    const interests = amortise(loan).map((month) => month.interestAmd);

    expect(interests).toEqual([...interests].sort((a, b) => b - a));
  });

  it('repays exactly the principal over the term', () => {
    const principal = amortise(loan).reduce((sum, month) => sum + month.principalAmd, 0);

    expect(principal).toBeCloseTo(loan.principalAmd, 4);
  });
});

describe('quarterlyInterest', () => {
  it('groups the months into threes', () => {
    const schedule = amortise({ principalAmd: 1_000_000, annualRatePct: 10, termYears: 1 });

    expect(quarterlyInterest(schedule)).toHaveLength(4);
  });

  it('adds up to the total interest', () => {
    const schedule = amortise(loan);
    const byQuarter = quarterlyInterest(schedule).reduce((sum, value) => sum + value, 0);

    expect(byQuarter).toBeCloseTo(totalInterest(schedule), 4);
  });

  it('falls quarter on quarter', () => {
    const quarters = quarterlyInterest(amortise(loan));

    expect(quarters).toEqual([...quarters].sort((a, b) => b - a));
  });
});

describe('rateForTotalInterest', () => {
  it('recovers the rate a schedule was built at', () => {
    const interest = totalInterest(amortise(loan));

    expect(rateForTotalInterest(interest, loan.principalAmd, loan.termYears)).toBeCloseTo(12, 2);
  });

  it('gives a lower rate for less interest, which is the whole point', () => {
    // "Your 12% mortgage behaves like a 9% one" is the sentence a buyer repeats.
    const interest = totalInterest(amortise(loan));

    const reduced = rateForTotalInterest(interest * 0.7, loan.principalAmd, loan.termYears);
    expect(reduced).toBeLessThan(12);
    expect(reduced).toBeGreaterThan(0);
  });

  it('is zero when nothing is owed in interest', () => {
    expect(rateForTotalInterest(0, loan.principalAmd, loan.termYears)).toBe(0);
  });
});
