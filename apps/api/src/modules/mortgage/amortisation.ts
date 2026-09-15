/**
 * What a mortgage costs, month by month.
 *
 * An annuity loan: the payment is constant and its composition shifts from
 * interest to principal over the term. The refund is capped by the interest paid
 * in a quarter, and that interest falls every month, so the whole calculation
 * needs the schedule rather than a total — a refund computed from average
 * interest would be wrong in both directions and wrong by more at the ends.
 *
 * Nothing here knows about tax. Keeping the arithmetic of a loan separate from
 * the arithmetic of a benefit means the first can be checked against any
 * mortgage calculator in the world, which is the fastest way to find out that it
 * is wrong.
 */

/** A month of the loan: what was paid, and how it split. */
export interface AmortisationMonth {
  /** 1 for the first payment. */
  month: number;
  interestAmd: number;
  principalAmd: number;
  /** What is left owing after this payment. */
  balanceAmd: number;
}

export interface AmortisationInput {
  principalAmd: number;
  /** Nominal annual rate as a percentage, e.g. 11.5. */
  annualRatePct: number;
  termYears: number;
}

/**
 * The constant monthly payment of an annuity loan.
 *
 * `P · i / (1 − (1 + i)^−n)`, the standard formula, with the zero-rate case
 * handled separately because that expression divides by zero there rather than
 * producing the obvious answer.
 */
export function monthlyPayment(input: AmortisationInput): number {
  const months = input.termYears * 12;
  const monthlyRate = input.annualRatePct / 100 / 12;
  if (months <= 0) {
    return 0;
  }
  if (monthlyRate === 0) {
    return input.principalAmd / months;
  }
  return (input.principalAmd * monthlyRate) / (1 - (1 + monthlyRate) ** -months);
}

/**
 * The full schedule.
 *
 * The final payment absorbs the rounding of every payment before it, so the
 * balance ends at exactly zero rather than at a few dram either way. A schedule
 * that does not close is the first thing a reader checks.
 */
export function amortise(input: AmortisationInput): AmortisationMonth[] {
  const months = input.termYears * 12;
  const monthlyRate = input.annualRatePct / 100 / 12;
  const payment = monthlyPayment(input);

  const schedule: AmortisationMonth[] = [];
  let balance = input.principalAmd;

  for (let month = 1; month <= months; month += 1) {
    const interestAmd = balance * monthlyRate;
    const isLast = month === months;
    const principalAmd = isLast ? balance : Math.min(payment - interestAmd, balance);
    balance = isLast ? 0 : balance - principalAmd;
    schedule.push({ month, interestAmd, principalAmd, balanceAmd: balance });
  }
  return schedule;
}

/** Interest paid in each three-month block, oldest first. */
export function quarterlyInterest(schedule: readonly AmortisationMonth[]): number[] {
  const quarters: number[] = [];
  for (let start = 0; start < schedule.length; start += 3) {
    quarters.push(
      schedule.slice(start, start + 3).reduce((sum, month) => sum + month.interestAmd, 0),
    );
  }
  return quarters;
}

/** Total interest over the whole term. */
export function totalInterest(schedule: readonly AmortisationMonth[]): number {
  return schedule.reduce((sum, month) => sum + month.interestAmd, 0);
}

/**
 * The nominal rate whose total interest equals a given amount.
 *
 * Used to express a refund as a rate: "your 11% mortgage behaves like a 9.2%
 * one" is the sentence a buyer repeats to somebody else, and a total in dram is
 * not. Solved by bisection because the relationship between rate and total
 * interest has no closed-form inverse and is monotonic, which is exactly the
 * case bisection is for. Fifty iterations over a 0–30% bracket settle it to far
 * beyond the precision anybody reads.
 */
export function rateForTotalInterest(
  target: number,
  principalAmd: number,
  termYears: number,
): number {
  if (target <= 0) {
    return 0;
  }
  let low = 0;
  let high = 30;
  for (let step = 0; step < 50; step += 1) {
    const mid = (low + high) / 2;
    const interest = totalInterest(amortise({ principalAmd, annualRatePct: mid, termYears }));
    if (interest < target) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return (low + high) / 2;
}
