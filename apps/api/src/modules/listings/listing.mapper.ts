import type {
  Building,
  ListingDetail,
  ListingSummary,
  ListingTranslation,
  Locale,
  Media,
} from '@smartestate/contracts';
import { pickTranslation } from '../../common/locale/locale.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { toNullableNumber, toNumber, type BuildingRow, type ListingRow } from './listing-row.js';

export type TranslationRecord = Prisma.ListingTranslationGetPayload<Record<string, never>>;
export type MediaRecord = Prisma.MediaGetPayload<Record<string, never>>;
export type PriceHistoryRecord = Prisma.ListingPriceHistoryGetPayload<Record<string, never>>;

const UNTITLED = 'Untitled listing';

export function toListingSummary(
  row: ListingRow,
  translations: readonly TranslationRecord[],
  thumbnail: MediaRecord | undefined,
  locale: Locale,
): ListingSummary {
  const translation = pickTranslation(translations, locale);
  return {
    id: row.id,
    publicId: row.public_id,
    status: row.status,
    locale: translation?.locale ?? locale,
    title: translation?.title ?? UNTITLED,
    priceAmd: toNumber(row.price_amd),
    pricePerSqmAmd: row.price_per_sqm_amd,
    originalCurrency: row.original_currency,
    originalPrice: toNullableNumber(row.original_price),
    priceNegotiable: row.price_negotiable,
    rooms: row.rooms,
    totalArea: toNumber(row.total_area),
    floor: row.floor,
    totalFloors: row.b_total_floors,
    buildingType: row.b_building_type,
    condition: row.condition,
    district: {
      slug: row.d_slug,
      name: { hy: row.d_name_hy, ru: row.d_name_ru, en: row.d_name_en },
    },
    location: { lat: row.lat, lon: row.lon },
    thumbnailUrl: thumbnail?.url ?? null,
    publishedAt: row.published_at.toISOString(),
  };
}

export function toListingDetail(
  row: ListingRow,
  translations: readonly TranslationRecord[],
  media: readonly MediaRecord[],
  priceHistory: readonly PriceHistoryRecord[],
  locale: Locale,
): ListingDetail {
  const translation = pickTranslation(translations, locale);
  const thumbnail = media.find((m) => m.kind === 'PHOTO');
  return {
    ...toListingSummary(row, translations, thumbnail, locale),
    description: translation?.description ?? '',
    livingArea: toNullableNumber(row.living_area),
    kitchenArea: toNullableNumber(row.kitchen_area),
    bathrooms: row.bathrooms,
    ceilingHeight: toNullableNumber(row.ceiling_height),
    balconyCount: row.balcony_count,
    hasLoggia: row.has_loggia,
    hasParking: row.has_parking,
    hasStorage: row.has_storage,
    heating: row.heating,
    ownershipDocs: row.ownership_docs,
    building: {
      id: row.building_id,
      districtId: row.district_id,
      addressLine: row.b_address_line,
      street: { hy: row.b_street_hy, ru: row.b_street_ru, en: row.b_street_en },
      houseNumber: row.b_house_number,
      buildingType: row.b_building_type,
      constructionYear: row.b_construction_year,
      totalFloors: row.b_total_floors,
      hasElevator: row.b_has_elevator,
      seismicRetrofit: row.b_seismic_retrofit,
      location: { lat: row.b_lat, lon: row.b_lon },
    },
    media: media.map(toMedia),
    translations: translations.map(toTranslation),
    priceHistory: priceHistory.map((entry) => ({
      priceAmd: toNumber(entry.priceAmd),
      recordedAt: entry.recordedAt.toISOString(),
    })),
    createdById: row.created_by_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function toMedia(record: MediaRecord): Media {
  return {
    id: record.id,
    kind: record.kind,
    url: record.url,
    width: record.width,
    height: record.height,
    sortOrder: record.sortOrder,
    isPlaceholder: record.isPlaceholder,
  };
}

export function toTranslation(record: TranslationRecord): ListingTranslation {
  return {
    locale: record.locale,
    title: record.title,
    description: record.description,
    isMachineTranslated: record.source === 'MACHINE',
  };
}

export function toBuilding(row: BuildingRow): Building {
  return {
    id: row.id,
    districtId: row.district_id,
    addressLine: row.address_line,
    street: { hy: row.street_hy, ru: row.street_ru, en: row.street_en },
    houseNumber: row.house_number,
    buildingType: row.building_type,
    constructionYear: row.construction_year,
    totalFloors: row.total_floors,
    hasElevator: row.has_elevator,
    seismicRetrofit: row.seismic_retrofit,
    location: { lat: row.lat, lon: row.lon },
  };
}
