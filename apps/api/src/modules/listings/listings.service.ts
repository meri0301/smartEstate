import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  CreateListingBody,
  ListingDetail,
  ListingSearchQuery,
  ListingSummary,
  Locale,
  Page,
  UpdateListingBody,
} from '@smartestate/contracts';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { uuidV7 } from '../../common/ids/uuid-v7.js';
import { toPage } from '../../common/pagination/cursor.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../admin/audit.service.js';
import type { ListingRow } from './listing-row.js';
import { toListingDetail, toListingSummary } from './listing.mapper.js';
import { ListingsRepository } from './listings.repository.js';
import { cursorOf } from './search-query.builder.js';

const PUBLIC_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function generatePublicId(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += PUBLIC_ID_ALPHABET.charAt(Math.floor(random() * PUBLIC_ID_ALPHABET.length));
  }
  return `L-${code}`;
}

/** Roles allowed to see non-active listings they do not own, and to edit any listing. */
const MODERATION_ROLES = new Set(['MODERATOR', 'ADMIN']);

export function canView(row: ListingRow, viewer: AuthenticatedUser | undefined): boolean {
  if (row.status === 'ACTIVE') {
    return true;
  }
  if (viewer === undefined) {
    return false;
  }
  return row.created_by_id === viewer.id || MODERATION_ROLES.has(viewer.role);
}

export function canEdit(row: ListingRow, actor: AuthenticatedUser): boolean {
  return row.created_by_id === actor.id || MODERATION_ROLES.has(actor.role);
}

@Injectable()
export class ListingsService {
  constructor(
    private readonly repository: ListingsRepository,
    private readonly audit: AuditService,
  ) {}

  async search(query: ListingSearchQuery, locale: Locale): Promise<Page<ListingSummary>> {
    const rows = await this.repository.search(query);
    const page = toPage(rows, query.limit, cursorOf(query.sort));
    const ids = page.items.map((row) => row.id);
    const [translations, thumbnails] = await Promise.all([
      this.repository.findTranslations(ids),
      this.repository.findThumbnails(ids),
    ]);
    return {
      items: page.items.map((row) =>
        toListingSummary(
          row,
          translations.filter((t) => t.listingId === row.id),
          thumbnails.find((m) => m.listingId === row.id),
          locale,
        ),
      ),
      nextCursor: page.nextCursor,
    };
  }

  async getDetail(
    idOrPublicId: string,
    viewer: AuthenticatedUser | undefined,
    locale: Locale,
  ): Promise<ListingDetail> {
    const row = UUID_PATTERN.test(idOrPublicId)
      ? await this.repository.findRowById(idOrPublicId)
      : await this.repository.findRowByPublicId(idOrPublicId);
    if (row === undefined || !canView(row, viewer)) {
      throw new NotFoundException({ message: 'Listing not found', code: 'NOT_FOUND' });
    }
    return this.hydrate(row, locale);
  }

  async create(
    body: CreateListingBody,
    actor: AuthenticatedUser,
    ipAddress: string | undefined,
    locale: Locale,
  ): Promise<ListingDetail> {
    const building = await this.repository.findBuilding(body.buildingId);
    if (building === undefined) {
      throw new UnprocessableEntityException({
        message: 'Building does not exist',
        code: 'UNKNOWN_BUILDING',
      });
    }
    if (body.floor > building.total_floors) {
      throw new BadRequestException({
        message: `Floor ${String(body.floor)} exceeds the building's ${String(building.total_floors)} floors`,
        code: 'FLOOR_OUT_OF_RANGE',
      });
    }
    const id = uuidV7();
    const priceAmd = BigInt(body.priceAmd);
    await this.repository.insertListing(
      {
        id,
        publicId: generatePublicId(),
        buildingId: body.buildingId,
        createdById: actor.id,
        priceAmd,
        priceNegotiable: body.priceNegotiable,
        originalCurrency: body.originalCurrency,
        originalPrice: body.originalPrice,
        pricePerSqmAmd: pricePerSqm(body.priceAmd, body.totalArea),
        totalArea: body.totalArea,
        livingArea: body.livingArea,
        kitchenArea: body.kitchenArea,
        rooms: body.rooms,
        bathrooms: body.bathrooms,
        ceilingHeight: body.ceilingHeight,
        floor: body.floor,
        balconyCount: body.balconyCount,
        hasLoggia: body.hasLoggia,
        hasParking: body.hasParking,
        hasStorage: body.hasStorage,
        condition: body.condition,
        heating: body.heating,
        ownershipDocs: body.ownershipDocs,
      },
      body.translations,
    );
    await this.audit.record({
      actorId: actor.id,
      action: 'listing.create',
      entityType: 'listing',
      entityId: id,
      ipAddress: ipAddress ?? null,
    });
    return this.getDetail(id, actor, locale);
  }

  async update(
    id: string,
    body: UpdateListingBody,
    actor: AuthenticatedUser,
    ipAddress: string | undefined,
    locale: Locale,
  ): Promise<ListingDetail> {
    const row = await this.requireEditable(id, actor);
    if (body.floor !== undefined && body.floor > row.b_total_floors) {
      throw new BadRequestException({
        message: `Floor ${String(body.floor)} exceeds the building's ${String(row.b_total_floors)} floors`,
        code: 'FLOOR_OUT_OF_RANGE',
      });
    }

    const { translations, status, priceAmd, ...attributes } = body;
    const data: Prisma.ListingUpdateInput = { ...attributes };
    if (status !== undefined) {
      data.status = status;
    }
    const currentPrice = BigInt(String(row.price_amd));
    const nextPrice = priceAmd === undefined ? undefined : BigInt(priceAmd);
    const priceChanged = nextPrice !== undefined && nextPrice !== currentPrice;
    if (nextPrice !== undefined) {
      data.priceAmd = nextPrice;
    }
    const effectivePrice = Number(nextPrice ?? currentPrice);
    const effectiveArea = body.totalArea ?? Number(String(row.total_area));
    if (priceAmd !== undefined || body.totalArea !== undefined) {
      data.pricePerSqmAmd = pricePerSqm(effectivePrice, effectiveArea);
    }

    await this.repository.updateListing(
      id,
      data,
      translations,
      priceChanged ? nextPrice : undefined,
    );
    await this.audit.record({
      actorId: actor.id,
      action: 'listing.update',
      entityType: 'listing',
      entityId: id,
      metadata: { fields: Object.keys(body) },
      ipAddress: ipAddress ?? null,
    });
    return this.getDetail(id, actor, locale);
  }

  /** Soft delete: the listing is withdrawn but its history stays for analytics. */
  async withdraw(
    id: string,
    actor: AuthenticatedUser,
    ipAddress: string | undefined,
  ): Promise<void> {
    const row = await this.requireEditable(id, actor);
    if (row.status !== 'WITHDRAWN') {
      await this.repository.updateListing(id, { status: 'WITHDRAWN' }, undefined, undefined);
    }
    await this.audit.record({
      actorId: actor.id,
      action: 'listing.withdraw',
      entityType: 'listing',
      entityId: id,
      ipAddress: ipAddress ?? null,
    });
  }

  private async requireEditable(id: string, actor: AuthenticatedUser): Promise<ListingRow> {
    const row = await this.repository.findRowById(id);
    if (row === undefined || !canView(row, actor)) {
      throw new NotFoundException({ message: 'Listing not found', code: 'NOT_FOUND' });
    }
    if (!canEdit(row, actor)) {
      throw new ForbiddenException({
        message: 'You may only modify your own listings',
        code: 'FORBIDDEN',
      });
    }
    return row;
  }

  private async hydrate(row: ListingRow, locale: Locale): Promise<ListingDetail> {
    const [translations, media, history] = await Promise.all([
      this.repository.findTranslations([row.id]),
      this.repository.findMedia(row.id),
      this.repository.findPriceHistory(row.id),
    ]);
    return toListingDetail(row, translations, media, history, locale);
  }
}

export function pricePerSqm(priceAmd: number, totalArea: number): number {
  if (totalArea <= 0) {
    throw new BadRequestException({
      message: 'totalArea must be positive',
      code: 'VALIDATION_FAILED',
    });
  }
  return Math.round(priceAmd / totalArea);
}
