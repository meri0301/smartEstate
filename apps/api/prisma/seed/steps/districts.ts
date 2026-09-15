import type { DistrictKind } from '../../../src/generated/prisma/enums.js';
import type { SeedContext } from '../lib/context.js';
import type { MultiPolygonCoordinates } from '../lib/geo.js';
import {
  isMultiPolygonGeometry,
  isRecord,
  readFeatureCollection,
  type MultiPolygonGeometry,
} from '../lib/geojson.js';
import { uuidV7 } from '../../../src/common/ids/uuid-v7.js';

export interface SeededDistrict {
  id: string;
  slug: string;
  kind: DistrictKind;
  nameHy: string;
  nameRu: string;
  nameEn: string;
  boundary: MultiPolygonCoordinates;
}

interface DistrictProperties {
  slug: string;
  kind: DistrictKind;
  city: string;
  marz: string | null;
  osmType: string;
  osmId: number;
  nameHy: string | null;
  nameRu: string | null;
  nameEn: string | null;
}

/**
 * English names as used in the brief and the UI. OpenStreetMap carries several
 * transliteration variants (e.g. "Norq Marash", "Qanaqer-Zeytun"); Armenian and
 * Russian names are taken from OSM unchanged.
 */
const CANONICAL_NAME_EN: Readonly<Record<string, string>> = {
  kentron: 'Kentron',
  arabkir: 'Arabkir',
  ajapnyak: 'Ajapnyak',
  avan: 'Avan',
  davtashen: 'Davtashen',
  erebuni: 'Erebuni',
  'kanaker-zeytun': 'Kanaker-Zeytun',
  'malatia-sebastia': 'Malatia-Sebastia',
  'nor-nork': 'Nor Nork',
  'nork-marash': 'Nork-Marash',
  nubarashen: 'Nubarashen',
  shengavit: 'Shengavit',
  gyumri: 'Gyumri',
  vanadzor: 'Vanadzor',
  dilijan: 'Dilijan',
};

function isDistrictProperties(value: unknown): value is DistrictProperties {
  return (
    isRecord(value) &&
    typeof value.slug === 'string' &&
    (value.kind === 'CITY_DISTRICT' || value.kind === 'TOWN') &&
    typeof value.city === 'string' &&
    typeof value.osmType === 'string' &&
    typeof value.osmId === 'number'
  );
}

function requireName(
  slug: string,
  value: string | null | undefined,
  fallback: string,
  locale: string,
): string {
  if (value !== null && value !== undefined && value.length > 0) {
    return value;
  }
  console.warn(`district ${slug}: missing ${locale} name in GeoJSON, using "${fallback}"`);
  return fallback;
}

export async function seedDistricts(ctx: SeedContext): Promise<SeededDistrict[]> {
  const collection = readFeatureCollection<MultiPolygonGeometry, DistrictProperties>(
    new URL('../data/districts.geojson', import.meta.url),
    isMultiPolygonGeometry,
    isDistrictProperties,
  );

  const seeded: SeededDistrict[] = [];
  for (const feature of collection.features) {
    const props = feature.properties;
    const nameEn =
      CANONICAL_NAME_EN[props.slug] ?? requireName(props.slug, props.nameEn, props.slug, 'English');
    const nameHy = requireName(props.slug, props.nameHy, nameEn, 'Armenian');
    const nameRu = requireName(props.slug, props.nameRu, nameEn, 'Russian');
    const id = uuidV7(ctx.referenceDate.getTime());
    const geometryJson = JSON.stringify(feature.geometry);

    await ctx.prisma.$executeRaw`
      INSERT INTO districts
        (id, slug, kind, name_hy, name_ru, name_en, city, marz, marz_code, osm_type, osm_id, boundary, centroid)
      VALUES (
        ${id}::uuid,
        ${props.slug},
        ${props.kind}::"DistrictKind",
        ${nameHy},
        ${nameRu},
        ${nameEn},
        ${props.city},
        ${props.marz ?? props.city},
        ${marzOf(props.slug, props.kind)}::"Marz",
        ${props.osmType},
        ${String(props.osmId)}::bigint,
        ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${geometryJson}), 4326)),
        ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON(${geometryJson}), 4326))
      )`;

    seeded.push({
      id,
      slug: props.slug,
      kind: props.kind,
      nameHy,
      nameRu,
      nameEn,
      boundary: feature.geometry.coordinates,
    });
  }
  return seeded;
}

/**
 * Which province each town outside Yerevan is in.
 *
 * Keyed by slug, which this project controls, and never taken from the `marz`
 * text OpenStreetMap returns — that holds community names such as
 * "Գյումրի-Ախուրյան սահման". The mortgage refund phases out province by
 * province, so this has to be right rather than approximately right.
 */
const MARZ_BY_SLUG: Readonly<Record<string, string>> = {
  gyumri: 'SHIRAK',
  vanadzor: 'LORI',
  dilijan: 'TAVUSH',
};

/**
 * The province for one district.
 *
 * Yerevan is modelled at district level and every other place at town level, so
 * the kind settles the common case. A town nobody has given a province throws:
 * defaulting it to anywhere would put a district in the wrong phase-out group
 * and quietly promise or deny a refund.
 */
function marzOf(slug: string, kind: string): string {
  if (kind === 'CITY_DISTRICT') {
    return 'YEREVAN';
  }
  const named = MARZ_BY_SLUG[slug];
  if (named === undefined) {
    throw new Error(
      `Town "${slug}" has no province. Add it to MARZ_BY_SLUG: the mortgage refund phases out by province and cannot guess.`,
    );
  }
  return named;
}
