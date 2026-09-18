/**
 * Turns the 2021 Yerevan scrape into the CSV the training CLI reads.
 *
 * The source is `data/yerevan-2021/flats.csv`, collected in May 2021 from
 * list.am and estate.am for an earlier project of the author's. Nothing here
 * fetches anything: the raw file and this script's output are both committed,
 * so a retrain is reproducible on a machine with no network, in the same way
 * the OSM boundaries are.
 *
 * Written in TypeScript rather than Python, beside a Python service, for one
 * practical reason: the ML image is built and run through Docker and carries no
 * source mount, so a Python preparation script could not be run or tested
 * without building the training image first. The training CLI already accepts
 * `--csv`, which makes the boundary between the two a file rather than a
 * language.
 *
 * Run from the repository root:
 *   pnpm --filter @smartestate/api exec tsx apps/ml/scripts/convert-yerevan-2021.ts
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(HERE, '..', 'data', 'yerevan-2021', 'flats.csv');
const TARGET = path.join(HERE, '..', 'data', 'yerevan-2021', 'training.csv');

/**
 * Central Bank of Armenia annual average for 2021, confirmed by the author.
 *
 * One conversion, applied once, recorded here. The alternative — training in
 * dollars and converting at serving time — would put a floating rate between
 * the model and its own output, so a valuation would change when nothing about
 * the property had.
 */
const USD_TO_AMD_2021 = 503.8;

/** Transliterated district names in the export against the product's slugs. */
const DISTRICTS: Readonly<Record<string, string>> = {
  Adjapnyak: 'ajapnyak',
  Arabkir: 'arabkir',
  Avan: 'avan',
  Davitashen: 'davtashen',
  Erebuni: 'erebuni',
  Kentron: 'kentron',
  'Malatia Sebastia': 'malatia-sebastia',
  'Nor Norq': 'nor-nork',
  'Norq Marash': 'nork-marash',
  Nubarashen: 'nubarashen',
  'Qanaqer Zeytun': 'kanaker-zeytun',
  Shengavit: 'shengavit',
};

/**
 * Structural type. `payte` (wooden) has no counterpart in the product's
 * vocabulary and is dropped rather than forced into the nearest one; there are
 * two such rows.
 */
const BUILDING_TYPES: Readonly<Record<string, string | null>> = {
  panelayin: 'PANEL',
  kasetayin: 'PANEL', // cassette panel, a Soviet panel variant
  qare: 'STONE',
  aghyuse: 'STONE', // brick; the vocabulary has no separate brick
  monolit: 'MONOLITH',
  payte: null,
};

/**
 * Condition, three levels against the product's five.
 *
 * `good_cond` means renovated, per the author, so it maps to the renovated
 * band rather than to "good condition". `OLD_RENOVATION` and `DESIGNER` go
 * unused: the scrape did not distinguish them, and inventing the distinction
 * would put detail in the training set that nobody observed.
 */
const CONDITIONS: Readonly<Record<string, string>> = {
  bad_cond: 'NEEDS_REPAIR',
  norm_cond: 'GOOD',
  good_cond: 'EURO_RENOVATION',
};

/**
 * Columns the training CLI reads. The ones this dataset cannot fill are written
 * empty rather than guessed — a blank is a fact about the scrape, and a
 * plausible number would be a fact about nothing.
 */
const OUTPUT_COLUMNS = [
  'public_id',
  'price_amd',
  'price_per_sqm_amd',
  'total_area',
  'living_area',
  'kitchen_area',
  'rooms',
  'bathrooms',
  'ceiling_height',
  'floor',
  'balcony_count',
  'has_loggia',
  'has_parking',
  'has_storage',
  'condition',
  'heating',
  'ownership_docs',
  'lat',
  'lon',
  'building_type',
  'construction_year',
  'total_floors',
  'has_elevator',
  'seismic_retrofit',
  'district_slug',
] as const;

interface SourceRow {
  tagh: string;
  gin: string;
  shintip: string;
  norakaruyc: string;
  verelak: string;
  senyak: string;
  sanhanguyc: string;
  makeres: string;
  patshgamb: string;
  veranorogum: string;
  tan_hark: string;
  shenqi_hark: string;
}

/** A stable identifier per row, so a rerun produces the same file. */
function publicIdFor(index: number, row: SourceRow): string {
  const digest = createHash('sha256')
    .update(`${String(index)}:${row.tagh}:${row.gin}:${row.makeres}`)
    .digest('hex');
  return `Y21-${digest.slice(0, 8).toUpperCase()}`;
}

function main(): void {
  // The export has Windows line endings. Splitting on \n alone leaves a \r on
  // the last field of every row, which silently renames the last column and
  // turns its values into NaN — visible only as an empty column much later.
  const lines = readFileSync(SOURCE, 'utf8').replace(/\r\n?/g, '\n').trim().split('\n');
  const header = lines[0]?.split(',') ?? [];
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ''])) as unknown as SourceRow;
  });

  const dropped: Record<string, number> = {};
  const drop = (reason: string): undefined => {
    dropped[reason] = (dropped[reason] ?? 0) + 1;
    return undefined;
  };

  const out: string[][] = [];
  rows.forEach((row, index) => {
    const districtSlug = DISTRICTS[row.tagh];
    if (districtSlug === undefined) return drop('unknown district');

    const isNewBuild = row.norakaruyc === '1';
    // The product models "new build" as a building type rather than a flag, so
    // a new build is recorded as one. It costs the structural type of those
    // rows, which is the price of speaking the product's vocabulary.
    const structural = BUILDING_TYPES[row.shintip];
    if (structural === undefined) return drop('unknown building type');
    if (structural === null) return drop('wooden building, no counterpart');
    const buildingType = isNewBuild ? 'NEW_BUILD' : structural;

    const condition = CONDITIONS[row.veranorogum];
    if (condition === undefined) return drop('unknown condition');

    const priceUsd = Number(row.gin);
    const totalArea = Number(row.makeres);
    const floor = Number(row.tan_hark);
    const totalFloors = Number(row.shenqi_hark);
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) return drop('unusable price');
    if (!Number.isFinite(totalArea) || totalArea <= 0) return drop('unusable area');
    if (floor > totalFloors) return drop('floor above the top of the building');

    const priceAmd = Math.round(priceUsd * USD_TO_AMD_2021);
    out.push([
      publicIdFor(index, row),
      String(priceAmd),
      String(Math.round(priceAmd / totalArea)),
      String(totalArea),
      '', // living_area: not scraped
      '', // kitchen_area: not scraped
      row.senyak,
      row.sanhanguyc,
      '', // ceiling_height: not scraped
      row.tan_hark,
      row.patshgamb,
      '', // has_loggia: not scraped
      '', // has_parking: not scraped
      '', // has_storage: not scraped
      condition,
      '', // heating: not scraped
      '', // ownership_docs: not scraped
      '', // lat: only the district was scraped, never a point
      '', // lon
      buildingType,
      '', // construction_year: not scraped
      row.shenqi_hark,
      row.verelak === '1' ? 'true' : 'false',
      '', // seismic_retrofit: not scraped
      districtSlug,
    ]);
  });

  writeFileSync(
    TARGET,
    `${[OUTPUT_COLUMNS.join(','), ...out.map((line) => line.join(','))].join('\n')}\n`,
  );

  const total = rows.length;
  const kept = out.length;
  console.log(`read    ${String(total)} rows from ${path.basename(SOURCE)}`);
  for (const [reason, count] of Object.entries(dropped)) {
    console.log(`dropped ${String(count).padStart(4)}  ${reason}`);
  }
  console.log(`wrote   ${String(kept)} rows to ${path.basename(TARGET)}`);
  console.log(`rate    1 USD = ${String(USD_TO_AMD_2021)} AMD (CBA 2021 average)`);
}

main();
