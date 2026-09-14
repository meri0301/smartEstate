/**
 * Data access for listings and buildings. Everything touching PostGIS geometry
 * is raw SQL here; purely relational reads and writes use the typed client.
 */
import { Injectable } from '@nestjs/common';
import type { CreateBuildingBody, ListingSearchQuery } from '@smartestate/contracts';
import { uuidV7 } from '../../common/ids/uuid-v7.js';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import type { BuildingRow, ListingRow } from './listing-row.js';
import type { MediaRecord, PriceHistoryRecord, TranslationRecord } from './listing.mapper.js';
import { buildSearchStatement, LISTING_SELECT } from './search-query.builder.js';

const BUILDING_SELECT = Prisma.sql`
  SELECT id, district_id, address_line, street_hy, street_ru, street_en, house_number, building_type,
         construction_year, total_floors, has_elevator, seismic_retrofit,
         ST_X(location) AS lon, ST_Y(location) AS lat
  FROM buildings`;

export interface NewListingRecord {
  id: string;
  publicId: string;
  buildingId: string;
  createdById: string;
  priceAmd: bigint;
  priceNegotiable: boolean;
  originalCurrency: string;
  originalPrice: number | null;
  pricePerSqmAmd: number;
  totalArea: number;
  livingArea: number | null;
  kitchenArea: number | null;
  rooms: number;
  bathrooms: number;
  ceilingHeight: number | null;
  floor: number;
  balconyCount: number;
  hasLoggia: boolean;
  hasParking: boolean;
  hasStorage: boolean;
  condition: string;
  heating: string;
  ownershipDocs: string;
}

@Injectable()
export class ListingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  search(query: ListingSearchQuery): Promise<ListingRow[]> {
    return this.prisma.$queryRaw<ListingRow[]>(buildSearchStatement(query));
  }

  async findRowById(id: string): Promise<ListingRow | undefined> {
    const rows = await this.prisma.$queryRaw<
      ListingRow[]
    >`${LISTING_SELECT} WHERE l.id = ${id}::uuid`;
    return rows[0];
  }

  async findRowByPublicId(publicId: string): Promise<ListingRow | undefined> {
    const rows = await this.prisma.$queryRaw<
      ListingRow[]
    >`${LISTING_SELECT} WHERE l.public_id = ${publicId}`;
    return rows[0];
  }

  findTranslations(listingIds: readonly string[]): Promise<TranslationRecord[]> {
    if (listingIds.length === 0) {
      return Promise.resolve([]);
    }
    return this.prisma.listingTranslation.findMany({
      where: { listingId: { in: [...listingIds] } },
    });
  }

  /** First photo per listing, for search-result cards. */
  findThumbnails(listingIds: readonly string[]): Promise<MediaRecord[]> {
    if (listingIds.length === 0) {
      return Promise.resolve([]);
    }
    return this.prisma.media.findMany({
      where: { listingId: { in: [...listingIds] }, kind: 'PHOTO' },
      orderBy: [{ listingId: 'asc' }, { sortOrder: 'asc' }],
      distinct: ['listingId'],
    });
  }

  findMedia(listingId: string): Promise<MediaRecord[]> {
    return this.prisma.media.findMany({ where: { listingId }, orderBy: { sortOrder: 'asc' } });
  }

  findPriceHistory(listingId: string): Promise<PriceHistoryRecord[]> {
    return this.prisma.listingPriceHistory.findMany({
      where: { listingId },
      orderBy: { recordedAt: 'asc' },
    });
  }

  /**
   * Inserts a listing, copying the building's location and district so the
   * spatial index and the composite search index live on the listings table.
   */
  async insertListing(
    record: NewListingRecord,
    translations: readonly { locale: string; title: string; description: string }[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // VALUES (not INSERT … SELECT) so PostgreSQL infers parameter types from
      // the target columns; the building supplies district and location.
      await tx.$executeRaw`
        INSERT INTO listings
          (id, public_id, building_id, district_id, created_by_id, source, status,
           price_amd, price_negotiable, original_currency, original_price, price_per_sqm_amd,
           total_area, living_area, kitchen_area, rooms, bathrooms, ceiling_height, floor,
           balcony_count, has_loggia, has_parking, has_storage, condition, heating, ownership_docs, location,
           updated_at)
        VALUES (
          ${record.id}::uuid, ${record.publicId}, ${record.buildingId}::uuid,
          (SELECT b.district_id FROM buildings b WHERE b.id = ${record.buildingId}::uuid),
          ${record.createdById}::uuid, 'manual', 'ACTIVE'::"ListingStatus",
          ${record.priceAmd.toString()}::bigint, ${record.priceNegotiable}, ${record.originalCurrency}::"Currency",
          ${record.originalPrice}::numeric, ${record.pricePerSqmAmd},
          ${record.totalArea}::numeric, ${record.livingArea}::numeric, ${record.kitchenArea}::numeric,
          ${record.rooms}, ${record.bathrooms}, ${record.ceilingHeight}::numeric, ${record.floor},
          ${record.balconyCount}, ${record.hasLoggia}, ${record.hasParking}, ${record.hasStorage},
          ${record.condition}::"Condition", ${record.heating}::"HeatingType", ${record.ownershipDocs}::"OwnershipDocsStatus",
          (SELECT b.location FROM buildings b WHERE b.id = ${record.buildingId}::uuid),
          now()
        )`;
      await tx.listingTranslation.createMany({
        data: translations.map((t) => ({
          listingId: record.id,
          locale: t.locale as TranslationRecord['locale'],
          title: t.title,
          description: t.description,
          source: 'HUMAN',
          isReviewed: true,
        })),
      });
      await tx.listingPriceHistory.create({
        data: { listingId: record.id, priceAmd: record.priceAmd },
      });
    });
  }

  /** Scalar update plus optional translation replacement and price-history entry, atomically. */
  async updateListing(
    id: string,
    data: Prisma.ListingUpdateInput,
    translations: readonly { locale: string; title: string; description: string }[] | undefined,
    newPriceAmd: bigint | undefined,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.listing.update({ where: { id }, data });
      if (translations !== undefined) {
        for (const t of translations) {
          await tx.listingTranslation.upsert({
            where: {
              listingId_locale: { listingId: id, locale: t.locale as TranslationRecord['locale'] },
            },
            create: {
              listingId: id,
              locale: t.locale as TranslationRecord['locale'],
              title: t.title,
              description: t.description,
              source: 'HUMAN',
              isReviewed: true,
            },
            update: {
              title: t.title,
              description: t.description,
              source: 'HUMAN',
              isReviewed: true,
            },
          });
        }
      }
      if (newPriceAmd !== undefined) {
        await tx.listingPriceHistory.create({ data: { listingId: id, priceAmd: newPriceAmd } });
      }
    });
  }

  async findBuilding(id: string): Promise<BuildingRow | undefined> {
    const rows = await this.prisma.$queryRaw<
      BuildingRow[]
    >`${BUILDING_SELECT} WHERE id = ${id}::uuid`;
    return rows[0];
  }

  /** District whose boundary contains the point, if any. */
  async findDistrictContaining(
    lat: number,
    lon: number,
  ): Promise<{ id: string; slug: string } | undefined> {
    const rows = await this.prisma.$queryRaw<{ id: string; slug: string }[]>`
      SELECT id, slug FROM districts
      WHERE ST_Contains(boundary, ST_SetSRID(ST_MakePoint(${lon}::double precision, ${lat}::double precision), 4326))
      ORDER BY kind LIMIT 1`;
    return rows[0];
  }

  async buildingExistsAt(districtId: string, addressLine: string): Promise<boolean> {
    const found = await this.prisma.building.findUnique({
      where: { districtId_addressLine: { districtId, addressLine } },
      select: { id: true },
    });
    return found !== null;
  }

  async insertBuilding(
    districtId: string,
    addressLine: string,
    body: CreateBuildingBody,
  ): Promise<string> {
    const id = uuidV7();
    await this.prisma.$executeRaw`
      INSERT INTO buildings
        (id, district_id, address_line, street_hy, street_ru, street_en, house_number,
         building_type, construction_year, total_floors, has_elevator, seismic_retrofit, location)
      VALUES (
        ${id}::uuid, ${districtId}::uuid, ${addressLine},
        ${body.street.hy}, ${body.street.ru}, ${body.street.en}, ${body.houseNumber},
        ${body.buildingType}::"BuildingType", ${body.constructionYear}, ${body.totalFloors},
        ${body.hasElevator}, ${body.seismicRetrofit},
        ST_SetSRID(ST_MakePoint(${body.location.lon}::double precision, ${body.location.lat}::double precision), 4326)
      )`;
    return id;
  }
}
