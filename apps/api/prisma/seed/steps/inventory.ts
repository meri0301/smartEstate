/**
 * Buildings, listings, translations, media and price history for the 12
 * Yerevan districts. Structure and price effects follow prisma/seed/lib/pricing.ts
 * and the calibration in prisma/seed/data/calibration.ts.
 */
import { Prisma } from '../../../src/generated/prisma/client.js';
import type {
  BuildingType,
  Condition,
  Currency,
  HeatingType,
  OwnershipDocsStatus,
} from '../../../src/generated/prisma/enums.js';
import {
  AREA_BY_ROOMS,
  BUILDING_TYPE_PROFILES,
  DISTRICT_CALIBRATION,
  ROOM_DISTRIBUTION,
  SEED_SOURCE,
  type DistrictCalibration,
} from '../data/calibration.js';
import { STREETS_BY_DISTRICT, type Street } from '../data/streets.js';
import { chunk, daysBefore, type SeedContext } from '../lib/context.js';
import { randomPointIn, type Position } from '../lib/geo.js';
import { estimatePricePerSqmAmd, roundPriceAmd, roundToStep } from '../lib/pricing.js';
import type { Rng } from '../lib/random.js';
import { buildListingTexts } from '../lib/text.js';
import { uuidV7 } from '../../../src/common/ids/uuid-v7.js';
import type { SeededDistrict } from './districts.js';

const LISTINGS_PER_BUILDING = 1.8;
const BATCH_SIZE = 50;
const PUBLIC_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

interface GeneratedBuilding {
  id: string;
  districtId: string;
  street: Street;
  houseNumber: string;
  addressLine: string;
  buildingType: BuildingType;
  constructionYear: number;
  totalFloors: number;
  hasElevator: boolean;
  seismicRetrofit: boolean;
  ceilingHeight: number;
  location: Position;
}

interface GeneratedListing {
  id: string;
  publicId: string;
  building: GeneratedBuilding;
  districtId: string;
  sourceRef: string;
  priceAmd: bigint;
  priceNegotiable: boolean;
  originalCurrency: Currency;
  originalPrice: string | null;
  pricePerSqmAmd: number;
  totalArea: number;
  livingArea: number;
  kitchenArea: number;
  rooms: number;
  bathrooms: number;
  ceilingHeight: number;
  floor: number;
  balconyCount: number;
  hasLoggia: boolean;
  hasParking: boolean;
  hasStorage: boolean;
  condition: Condition;
  heating: HeatingType;
  ownershipDocs: OwnershipDocsStatus;
  publishedAt: Date;
  previousPriceAmd: bigint | null;
}

export interface InventoryCounts {
  buildings: number;
  listings: number;
  translations: number;
  media: number;
  priceHistory: number;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function generatePublicId(rng: Rng, taken: Set<string>): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < 6; i += 1) {
      code += PUBLIC_ID_ALPHABET.charAt(rng.int(0, PUBLIC_ID_ALPHABET.length - 1));
    }
    const publicId = `L-${code}`;
    if (!taken.has(publicId)) {
      taken.add(publicId);
      return publicId;
    }
  }
}

function generateBuilding(
  ctx: SeedContext,
  district: SeededDistrict,
  calibration: DistrictCalibration,
  usedAddresses: Set<string>,
): GeneratedBuilding {
  const { rng } = ctx;
  const streets = STREETS_BY_DISTRICT[district.slug];
  if (streets === undefined || streets.length === 0) {
    throw new Error(`No street list for district "${district.slug}"`);
  }
  const buildingType = rng.weighted(calibration.buildingTypeMix);
  const profile = BUILDING_TYPE_PROFILES[buildingType];

  let street = rng.pick(streets);
  let houseNumber = String(rng.int(1, 120));
  let addressLine = `${street.en} ${houseNumber}`;
  while (usedAddresses.has(addressLine)) {
    street = rng.pick(streets);
    houseNumber = `${String(rng.int(1, 120))}${rng.chance(0.2) ? '/' + String(rng.int(1, 4)) : ''}`;
    addressLine = `${street.en} ${houseNumber}`;
  }
  usedAddresses.add(addressLine);

  const constructionYear = rng.int(profile.constructionYear[0], profile.constructionYear[1]);
  const totalFloors = rng.int(profile.totalFloors[0], profile.totalFloors[1]);
  const hasElevator = totalFloors > 5 ? rng.chance(0.92) : rng.chance(0.05);
  // Buildings designed after the post-Spitak (1988) code revision count as compliant;
  // older stock is flagged only when retrofitting was declared.
  const seismicRetrofit = constructionYear >= 1995 ? rng.chance(0.85) : rng.chance(0.12);

  return {
    id: uuidV7(ctx.referenceDate.getTime()),
    districtId: district.id,
    street,
    houseNumber,
    addressLine,
    buildingType,
    constructionYear,
    totalFloors,
    hasElevator,
    seismicRetrofit,
    ceilingHeight: round(rng.float(profile.ceilingHeight[0], profile.ceilingHeight[1]), 2),
    location: randomPointIn(district.boundary, rng),
  };
}

function pickCondition(rng: Rng, buildingType: BuildingType): Condition {
  if (buildingType === 'NEW_BUILD') {
    return rng.weighted<Condition>([
      ['NEEDS_REPAIR', 25], // sold as bare shell ("black frame")
      ['GOOD', 30],
      ['EURO_RENOVATION', 35],
      ['DESIGNER', 10],
    ]);
  }
  if (buildingType === 'MONOLITH') {
    return rng.weighted<Condition>([
      ['GOOD', 35],
      ['EURO_RENOVATION', 45],
      ['DESIGNER', 15],
      ['OLD_RENOVATION', 5],
    ]);
  }
  return rng.weighted<Condition>([
    ['NEEDS_REPAIR', 15],
    ['OLD_RENOVATION', 30],
    ['GOOD', 30],
    ['EURO_RENOVATION', 20],
    ['DESIGNER', 5],
  ]);
}

function pickHeating(rng: Rng, buildingType: BuildingType): HeatingType {
  if (buildingType === 'NEW_BUILD' || buildingType === 'MONOLITH') {
    return rng.weighted<HeatingType>([
      ['INDIVIDUAL_GAS_BOILER', 70],
      ['ELECTRIC', 25],
      ['CENTRAL_GAS', 3],
      ['NONE', 2],
    ]);
  }
  return rng.weighted<HeatingType>([
    ['INDIVIDUAL_GAS_BOILER', 55],
    ['ELECTRIC', 30],
    ['NONE', 10],
    ['CENTRAL_GAS', 5],
  ]);
}

function generateListing(
  ctx: SeedContext,
  building: GeneratedBuilding,
  calibration: DistrictCalibration,
  usdToAmd: number,
  sequence: number,
  publicIds: Set<string>,
): GeneratedListing {
  const { rng } = ctx;
  const rooms = rng.weighted(ROOM_DISTRIBUTION);
  const areaRange = AREA_BY_ROOMS[rooms];
  if (areaRange === undefined) {
    throw new Error(`No area range configured for ${String(rooms)} rooms`);
  }
  const areaScale =
    building.buildingType === 'NEW_BUILD' || building.buildingType === 'MONOLITH' ? 1.15 : 1;
  const totalArea = round(rng.float(areaRange[0], areaRange[1]) * areaScale, 1);
  const kitchenArea = round(totalArea * rng.float(0.1, 0.16), 1);
  const livingArea = round(totalArea * rng.float(0.55, 0.68), 1);

  const floor = rng.int(1, building.totalFloors);
  const condition = pickCondition(rng, building.buildingType);
  const heating = pickHeating(rng, building.buildingType);
  const isModern = building.buildingType === 'NEW_BUILD' || building.buildingType === 'MONOLITH';

  const pricePerSqm = estimatePricePerSqmAmd({
    districtMedianPerSqmAmd: calibration.medianPricePerSqmAmd,
    buildingType: building.buildingType,
    condition,
    floor,
    totalFloors: building.totalFloors,
    hasElevator: building.hasElevator,
    ceilingHeightMeters: building.ceilingHeight,
    noiseFactor: rng.logNormalFactor(calibration.priceNoiseSigma),
  });

  // Roughly half of Yerevan asking prices are quoted in USD; keep AMD canonical.
  const quotedInUsd = rng.chance(0.55);
  let priceAmd: bigint;
  let originalCurrency: Currency = 'AMD';
  let originalPrice: string | null = null;
  if (quotedInUsd) {
    const usd = roundToStep((pricePerSqm * totalArea) / usdToAmd, 500);
    originalCurrency = 'USD';
    originalPrice = usd.toFixed(2);
    priceAmd = BigInt(roundToStep(usd * usdToAmd, 1_000));
  } else {
    priceAmd = roundPriceAmd(pricePerSqm * totalArea);
  }

  const publishedAt = daysBefore(ctx.referenceDate, rng.int(0, 90), rng.int(0, 23));
  const previousPriceAmd = rng.chance(0.3)
    ? BigInt(roundToStep(Number(priceAmd) * rng.float(1.03, 1.09), 100_000))
    : null;

  return {
    id: uuidV7(publishedAt.getTime()),
    publicId: generatePublicId(rng, publicIds),
    building,
    districtId: building.districtId,
    sourceRef: `seed-${String(sequence).padStart(4, '0')}`,
    priceAmd,
    priceNegotiable: rng.chance(0.4),
    originalCurrency,
    originalPrice,
    pricePerSqmAmd: Math.round(Number(priceAmd) / totalArea),
    totalArea,
    livingArea,
    kitchenArea,
    rooms,
    bathrooms: rooms >= 3 && rng.chance(0.4) ? 2 : 1,
    ceilingHeight: building.ceilingHeight,
    floor,
    balconyCount: rng.weighted([
      [0, 20],
      [1, 55],
      [2, 25],
    ]),
    hasLoggia: rng.chance(0.3),
    hasParking: isModern ? rng.chance(0.5) : rng.chance(0.1),
    hasStorage: rng.chance(0.25),
    condition,
    heating,
    ownershipDocs: rng.chance(0.75) ? 'VERIFIED' : 'UNVERIFIED',
    publishedAt,
    previousPriceAmd,
  };
}

async function insertBuildings(
  ctx: SeedContext,
  buildings: readonly GeneratedBuilding[],
): Promise<void> {
  for (const batch of chunk(buildings, BATCH_SIZE)) {
    const rows = batch.map(
      (b) => Prisma.sql`(
        ${b.id}::uuid, ${b.districtId}::uuid, ${b.addressLine},
        ${b.street.hy}, ${b.street.ru}, ${b.street.en}, ${b.houseNumber},
        ${b.buildingType}::"BuildingType", ${b.constructionYear}, ${b.totalFloors},
        ${b.hasElevator}, ${b.seismicRetrofit},
        ST_SetSRID(ST_MakePoint(${b.location[0]}::double precision, ${b.location[1]}::double precision), 4326)
      )`,
    );
    await ctx.prisma.$executeRaw`
      INSERT INTO buildings
        (id, district_id, address_line, street_hy, street_ru, street_en, house_number,
         building_type, construction_year, total_floors, has_elevator, seismic_retrofit, location)
      VALUES ${Prisma.join(rows)}`;
  }
}

async function insertListings(
  ctx: SeedContext,
  listings: readonly GeneratedListing[],
): Promise<void> {
  for (const batch of chunk(listings, BATCH_SIZE)) {
    const rows = batch.map(
      (l) => Prisma.sql`(
        ${l.id}::uuid, ${l.publicId}, ${l.building.id}::uuid, ${l.districtId}::uuid,
        ${SEED_SOURCE}, ${l.sourceRef}, 'PUBLISHED'::"ListingStatus",
        ${l.priceAmd.toString()}::bigint, ${l.priceNegotiable},
        ${l.originalCurrency}::"Currency", ${l.originalPrice}::numeric, ${l.pricePerSqmAmd},
        ${l.totalArea.toFixed(2)}::numeric, ${l.livingArea.toFixed(2)}::numeric, ${l.kitchenArea.toFixed(2)}::numeric,
        ${l.rooms}, ${l.bathrooms}, ${l.ceilingHeight.toFixed(2)}::numeric, ${l.floor},
        ${l.balconyCount}, ${l.hasLoggia}, ${l.hasParking}, ${l.hasStorage},
        ${l.condition}::"Condition", ${l.heating}::"HeatingType", ${l.ownershipDocs}::"OwnershipDocsStatus",
        ST_SetSRID(ST_MakePoint(${l.building.location[0]}::double precision, ${l.building.location[1]}::double precision), 4326),
        ${l.publishedAt}, ${l.publishedAt}, ${l.publishedAt}
      )`,
    );
    await ctx.prisma.$executeRaw`
      INSERT INTO listings
        (id, public_id, building_id, district_id, source, source_ref, status,
         price_amd, price_negotiable, original_currency, original_price, price_per_sqm_amd,
         total_area, living_area, kitchen_area, rooms, bathrooms, ceiling_height, floor,
         balcony_count, has_loggia, has_parking, has_storage,
         condition, heating, ownership_docs, location, published_at, created_at, updated_at)
      VALUES ${Prisma.join(rows)}`;
  }
}

export async function seedInventory(
  ctx: SeedContext,
  districts: readonly SeededDistrict[],
  usdToAmd: number,
): Promise<InventoryCounts> {
  const bySlug = new Map(districts.map((d) => [d.slug, d]));
  const buildings: GeneratedBuilding[] = [];
  const listings: GeneratedListing[] = [];
  const publicIds = new Set<string>();
  let sequence = 1;

  for (const calibration of DISTRICT_CALIBRATION) {
    const district = bySlug.get(calibration.slug);
    if (district === undefined) {
      throw new Error(`Calibration references unknown district "${calibration.slug}"`);
    }
    const usedAddresses = new Set<string>();
    const buildingCount = Math.max(1, Math.ceil(calibration.listingCount / LISTINGS_PER_BUILDING));
    const districtBuildings = Array.from({ length: buildingCount }, () =>
      generateBuilding(ctx, district, calibration, usedAddresses),
    );
    buildings.push(...districtBuildings);

    for (let i = 0; i < calibration.listingCount; i += 1) {
      // Every building gets at least one listing; the remainder is spread at random.
      const building =
        i < districtBuildings.length ? districtBuildings[i] : ctx.rng.pick(districtBuildings);
      if (building === undefined) {
        throw new Error('Building allocation failed');
      }
      listings.push(generateListing(ctx, building, calibration, usdToAmd, sequence, publicIds));
      sequence += 1;
    }
  }

  await insertBuildings(ctx, buildings);
  await insertListings(ctx, listings);

  const districtById = new Map(districts.map((d) => [d.id, d]));
  const translations = listings.flatMap((l) => {
    const district = districtById.get(l.districtId);
    if (district === undefined) {
      throw new Error('Listing references unknown district');
    }
    const texts = buildListingTexts({
      rooms: l.rooms,
      totalArea: l.totalArea,
      floor: l.floor,
      totalFloors: l.building.totalFloors,
      buildingType: l.building.buildingType,
      constructionYear: l.building.constructionYear,
      condition: l.condition,
      heating: l.heating,
      ceilingHeight: l.ceilingHeight,
      hasElevator: l.building.hasElevator,
      balconyCount: l.balconyCount,
      hasParking: l.hasParking,
      hasStorage: l.hasStorage,
      priceNegotiable: l.priceNegotiable,
      docsVerified: l.ownershipDocs === 'VERIFIED',
      district,
      street: l.building.street,
      houseNumber: l.building.houseNumber,
    });
    return (['hy', 'ru', 'en'] as const).map((locale) => ({
      listingId: l.id,
      locale,
      title: texts[locale].title,
      description: texts[locale].description,
      source: 'HUMAN' as const,
      isReviewed: true,
    }));
  });
  const translationResult = await ctx.prisma.listingTranslation.createMany({ data: translations });

  const media = listings.flatMap((l) => {
    const photoCount = ctx.rng.int(3, 5);
    return Array.from({ length: photoCount }, (_, index) => ({
      listingId: l.id,
      kind: 'PHOTO' as const,
      // Placeholder imagery: deterministic per listing so the UI is stable between reseeds.
      url: `https://picsum.photos/seed/${l.publicId}-${String(index + 1)}/1200/800`,
      width: 1200,
      height: 800,
      sortOrder: index,
      isPlaceholder: true,
    }));
  });
  const mediaResult = await ctx.prisma.media.createMany({ data: media });

  const history = listings.flatMap((l) => {
    const rows = [{ listingId: l.id, priceAmd: l.priceAmd, recordedAt: l.publishedAt }];
    if (l.previousPriceAmd !== null) {
      rows.unshift({
        listingId: l.id,
        priceAmd: l.previousPriceAmd,
        recordedAt: daysBefore(l.publishedAt, ctx.rng.int(20, 60)),
      });
    }
    return rows;
  });
  const historyResult = await ctx.prisma.listingPriceHistory.createMany({ data: history });

  return {
    buildings: buildings.length,
    listings: listings.length,
    translations: translationResult.count,
    media: mediaResult.count,
    priceHistory: historyResult.count,
  };
}
