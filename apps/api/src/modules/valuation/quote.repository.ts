/**
 * What the catalogue knows about a district, for valuing a property in it.
 *
 * Two jobs. It supplies the district's own facts — where it is, and what its
 * housing stock is typically like — so that a reader who does not know the year
 * their building went up still gets an estimate, with the substitution reported
 * rather than hidden. And it counts the listings close enough to the property to
 * stand behind the figure, which is what separates an estimate the catalogue
 * supports from one it is extrapolating.
 */
import { Injectable } from '@nestjs/common';
import type { HeatingType } from '@smartestate/contracts';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

/**
 * How far from the property a listing may be and still be a comparable.
 *
 * Same district, same room count, and within this much of the floor area. It is
 * deliberately the same neighbourhood the reader would look at themselves: a
 * 60m² two-room flat is not evidence about a 130m² four-room one, however close
 * it stands.
 */
export const COMPARABLE_AREA_RATIO = 0.25;

export interface DistrictStock {
  lat: number;
  lon: number;
  /** Median year of construction among published listings, if the district has any. */
  medianConstructionYear: number | undefined;
  /** The commonest heating among them, if the district has any. */
  commonestHeating: HeatingType | undefined;
  /**
   * The interior details the form never asks about.
   *
   * They matter more than they look. The model was trained on listings that
   * state them, so sending nulls does not describe a property whose ceiling
   * height is unremarkable — it describes one whose ceiling height is unknown,
   * which is a different and much rarer thing. Left null, ceiling height alone
   * came back as the second largest factor in a quote, worth −10% of the
   * estimate, for a question the reader was never asked.
   */
  medianCeilingHeight: number | undefined;
  /** Living area as a share of total, so it scales to the property's own size. */
  medianLivingAreaRatio: number | undefined;
  medianKitchenAreaRatio: number | undefined;
  medianBathrooms: number | undefined;
  medianBalconyCount: number | undefined;
}

interface StockRow {
  lat: number;
  lon: number;
  median_construction_year: number | null;
  commonest_heating: HeatingType | null;
  median_ceiling_height: string | number | null;
  median_living_area_ratio: string | number | null;
  median_kitchen_area_ratio: string | number | null;
  median_bathrooms: number | null;
  median_balcony_count: number | null;
}

interface CountRow {
  comparable_count: bigint;
}

@Injectable()
export class QuoteRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The district's centre and the shape of its housing stock.
   *
   * The medians are taken over published listings only, because those are the
   * rows the model was trained on; a draft nobody has reviewed should not move
   * what the product assumes about a neighbourhood.
   */
  async districtStock(slug: string): Promise<DistrictStock | undefined> {
    const rows = await this.prisma.$queryRaw<StockRow[]>`
      WITH published AS (
        SELECT l.*, b.construction_year
        FROM listings l
        JOIN buildings b ON b.id = l.building_id
        JOIN districts d ON d.id = l.district_id
        WHERE d.slug = ${slug} AND l.status = 'PUBLISHED'
      )
      SELECT ST_Y(d.centroid) AS lat,
             ST_X(d.centroid) AS lon,
             (SELECT CAST(percentile_disc(0.5) WITHIN GROUP (ORDER BY construction_year) AS INTEGER)
                FROM published) AS median_construction_year,
             (SELECT heating FROM published
               GROUP BY heating ORDER BY COUNT(*) DESC, heating ASC LIMIT 1) AS commonest_heating,
             (SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY ceiling_height)
                FROM published WHERE ceiling_height IS NOT NULL) AS median_ceiling_height,
             (SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY living_area / total_area)
                FROM published WHERE living_area IS NOT NULL) AS median_living_area_ratio,
             (SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY kitchen_area / total_area)
                FROM published WHERE kitchen_area IS NOT NULL) AS median_kitchen_area_ratio,
             (SELECT CAST(percentile_disc(0.5) WITHIN GROUP (ORDER BY bathrooms) AS INTEGER)
                FROM published) AS median_bathrooms,
             (SELECT CAST(percentile_disc(0.5) WITHIN GROUP (ORDER BY balcony_count) AS INTEGER)
                FROM published) AS median_balcony_count
      FROM districts d
      WHERE d.slug = ${slug}
    `;

    const row = rows[0];
    if (row === undefined) {
      return undefined;
    }
    return {
      lat: row.lat,
      lon: row.lon,
      medianConstructionYear: row.median_construction_year ?? undefined,
      commonestHeating: row.commonest_heating ?? undefined,
      medianCeilingHeight: toNumber(row.median_ceiling_height),
      medianLivingAreaRatio: toNumber(row.median_living_area_ratio),
      medianKitchenAreaRatio: toNumber(row.median_kitchen_area_ratio),
      medianBathrooms: row.median_bathrooms ?? undefined,
      medianBalconyCount: row.median_balcony_count ?? undefined,
    };
  }

  /** Published listings in the same district, of the same size, at a similar area. */
  async countComparables(input: {
    districtSlug: string;
    rooms: number;
    totalArea: number;
  }): Promise<number> {
    const lowerArea = input.totalArea * (1 - COMPARABLE_AREA_RATIO);
    const upperArea = input.totalArea * (1 + COMPARABLE_AREA_RATIO);

    const rows = await this.prisma.$queryRaw<CountRow[]>`
      SELECT COUNT(*) AS comparable_count
      FROM listings l
      JOIN districts d ON d.id = l.district_id
      WHERE d.slug = ${input.districtSlug}
        AND l.status = 'PUBLISHED'
        AND l.rooms = ${input.rooms}
        AND l.total_area BETWEEN ${new Prisma.Decimal(lowerArea)} AND ${new Prisma.Decimal(upperArea)}
    `;

    return Number(rows[0]?.comparable_count ?? 0n);
  }
}

/** Postgres returns `numeric` as a string through the driver; `null` stays absent. */
function toNumber(value: string | number | null): number | undefined {
  if (value === null) {
    return undefined;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
