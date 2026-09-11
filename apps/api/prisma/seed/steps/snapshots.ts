import {
  DISTRICT_CALIBRATION,
  GROSS_RENTAL_YIELD,
  MONTHLY_PRICE_DRIFT,
  SNAPSHOT_MONTHS,
} from '../data/calibration.js';
import { monthStart, type SeedContext } from '../lib/context.js';
import type { SeededDistrict } from './districts.js';

/**
 * Twelve months of synthetic per-district market history: a gentle upward
 * drift with month-to-month noise, plus a rent estimate derived from the
 * calibrated gross yield. Feeds the trend charts and the investment score.
 */
export async function seedMarketSnapshots(
  ctx: SeedContext,
  districts: readonly SeededDistrict[],
): Promise<number> {
  const bySlug = new Map(districts.map((d) => [d.slug, d]));
  const rows: {
    districtId: string;
    periodStart: Date;
    medianPricePerSqmAmd: number;
    meanPricePerSqmAmd: number;
    medianRentPerSqmAmd: number;
    listingCount: number;
  }[] = [];

  for (const calibration of DISTRICT_CALIBRATION) {
    const district = bySlug.get(calibration.slug);
    if (district === undefined) {
      throw new Error(`Calibration references unknown district "${calibration.slug}"`);
    }
    for (let monthsBack = SNAPSHOT_MONTHS - 1; monthsBack >= 0; monthsBack -= 1) {
      const trend = (1 + MONTHLY_PRICE_DRIFT) ** -monthsBack;
      const noise = ctx.rng.logNormalFactor(0.015);
      const median = Math.round(calibration.medianPricePerSqmAmd * trend * noise);
      rows.push({
        districtId: district.id,
        periodStart: monthStart(ctx.referenceDate, monthsBack),
        medianPricePerSqmAmd: median,
        // Asking-price distributions are right-skewed, so the mean sits above the median.
        meanPricePerSqmAmd: Math.round(median * ctx.rng.float(1.03, 1.07)),
        medianRentPerSqmAmd: Math.round((median * GROSS_RENTAL_YIELD) / 12),
        listingCount: Math.max(1, Math.round(calibration.listingCount * ctx.rng.float(0.8, 1.25))),
      });
    }
  }

  const result = await ctx.prisma.districtMarketSnapshot.createMany({ data: rows });
  return result.count;
}
