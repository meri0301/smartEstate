/**
 * Shape of one row returned by the listing search / detail SQL. Postgres numeric
 * types arrive as `Prisma.Decimal`, int8 as `bigint` and float8 as `number`;
 * the mapper normalises them, so these fields are typed loosely on purpose.
 */
import type {
  BuildingType,
  Condition,
  Currency,
  HeatingType,
  ListingStatus,
  OwnershipDocsStatus,
} from '@smartestate/contracts';

export type NumericLike = number | bigint | string | { toString(): string };

export interface ListingRow {
  id: string;
  public_id: string;
  status: ListingStatus;
  price_amd: NumericLike;
  price_per_sqm_amd: number;
  original_currency: Currency;
  original_price: NumericLike | null;
  price_negotiable: boolean;
  rooms: number;
  bathrooms: number;
  total_area: NumericLike;
  living_area: NumericLike | null;
  kitchen_area: NumericLike | null;
  ceiling_height: NumericLike | null;
  floor: number;
  balcony_count: number;
  has_loggia: boolean;
  has_parking: boolean;
  has_storage: boolean;
  condition: Condition;
  heating: HeatingType;
  ownership_docs: OwnershipDocsStatus;
  lon: number;
  lat: number;
  published_at: Date;
  created_at: Date;
  updated_at: Date;
  created_by_id: string | null;
  building_id: string;
  district_id: string;

  b_address_line: string;
  b_street_hy: string;
  b_street_ru: string;
  b_street_en: string;
  b_house_number: string;
  b_building_type: BuildingType;
  b_construction_year: number;
  b_total_floors: number;
  b_has_elevator: boolean;
  b_seismic_retrofit: boolean;
  b_lon: number;
  b_lat: number;

  d_slug: string;
  d_name_hy: string;
  d_name_ru: string;
  d_name_en: string;
}

export interface BuildingRow {
  id: string;
  district_id: string;
  address_line: string;
  street_hy: string;
  street_ru: string;
  street_en: string;
  house_number: string;
  building_type: BuildingType;
  construction_year: number;
  total_floors: number;
  has_elevator: boolean;
  seismic_retrofit: boolean;
  lon: number;
  lat: number;
}

export function toNumber(value: NumericLike): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return Number(typeof value === 'string' ? value : value.toString());
}

export function toNullableNumber(value: NumericLike | null): number | null {
  return value === null ? null : toNumber(value);
}
