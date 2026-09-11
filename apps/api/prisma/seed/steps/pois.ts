import { Prisma } from '../../../src/generated/prisma/client.js';
import { PoiCategory } from '../../../src/generated/prisma/enums.js';
import { chunk, type SeedContext } from '../lib/context.js';
import {
  isPointGeometry,
  isRecord,
  readFeatureCollection,
  type PointGeometry,
} from '../lib/geojson.js';
import { uuidV7 } from '../lib/uuid.js';

interface PoiProperties {
  category: PoiCategory;
  osmType: string;
  /** null when the record was captured without its OSM id (see data/pois.geojson `note`). */
  osmId: number | null;
  nameHy: string | null;
  nameRu: string | null;
  nameEn: string | null;
}

const CATEGORIES = new Set<string>(Object.values(PoiCategory));

function isPoiProperties(value: unknown): value is PoiProperties {
  return (
    isRecord(value) &&
    typeof value.category === 'string' &&
    CATEGORIES.has(value.category) &&
    typeof value.osmType === 'string' &&
    (typeof value.osmId === 'number' || value.osmId === null)
  );
}

const BATCH_SIZE = 200;

/** Loads OSM amenities and assigns each to the district containing it. */
export async function seedPointsOfInterest(ctx: SeedContext): Promise<number> {
  const collection = readFeatureCollection<PointGeometry, PoiProperties>(
    new URL('../data/pois.geojson', import.meta.url),
    isPointGeometry,
    isPoiProperties,
  );

  let inserted = 0;
  for (const batch of chunk(collection.features, BATCH_SIZE)) {
    const rows = batch.map((feature) => {
      const [lon, lat] = feature.geometry.coordinates;
      const p = feature.properties;
      return Prisma.sql`(
        ${uuidV7(ctx.referenceDate.getTime())}::uuid,
        ${p.category}::"PoiCategory",
        ${p.nameHy},
        ${p.nameRu},
        ${p.nameEn},
        ${p.osmType},
        ${p.osmId === null ? null : String(p.osmId)}::bigint,
        ST_SetSRID(ST_MakePoint(${lon}::double precision, ${lat}::double precision), 4326)
      )`;
    });

    inserted += await ctx.prisma.$executeRaw`
      INSERT INTO points_of_interest
        (id, category, name_hy, name_ru, name_en, osm_type, osm_id, location)
      VALUES ${Prisma.join(rows)}
      ON CONFLICT (osm_type, osm_id) DO NOTHING`;
  }

  await ctx.prisma.$executeRaw`
    UPDATE points_of_interest AS p
    SET district_id = d.id
    FROM districts AS d
    WHERE p.district_id IS NULL AND ST_Contains(d.boundary, p.location)`;

  return inserted;
}
