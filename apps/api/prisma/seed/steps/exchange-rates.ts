import { EXCHANGE_RATE_BASE, SEED_SOURCE } from '../data/calibration.js';
import { daysBefore, type SeedContext } from '../lib/context.js';

const DAYS_OF_HISTORY = 30;

export interface SeededRates {
  /** Latest USD → AMD rate, used to quote listings priced in dollars. */
  usdToAmd: number;
  count: number;
}

/**
 * Generates a 30-day synthetic rate series as a bounded random walk around the
 * calibrated base rates. The real CBA feed replaces this in a later phase.
 */
export async function seedExchangeRates(ctx: SeedContext): Promise<SeededRates> {
  const rows: { date: Date; currency: 'USD' | 'EUR'; rateToAmd: string; source: string }[] = [];
  let latestUsd = EXCHANGE_RATE_BASE.USD;

  for (const currency of ['USD', 'EUR'] as const) {
    let rate = EXCHANGE_RATE_BASE[currency];
    const series: number[] = [];
    for (let day = DAYS_OF_HISTORY - 1; day >= 0; day -= 1) {
      rate = rate * (1 + ctx.rng.normal(0, 0.0015));
      series.push(rate);
      rows.push({
        date: daysBefore(ctx.referenceDate, day),
        currency,
        rateToAmd: rate.toFixed(4),
        source: SEED_SOURCE,
      });
    }
    if (currency === 'USD') {
      latestUsd = series.at(-1) ?? EXCHANGE_RATE_BASE.USD;
    }
  }

  const result = await ctx.prisma.exchangeRate.createMany({ data: rows });
  return { usdToAmd: latestUsd, count: result.count };
}
