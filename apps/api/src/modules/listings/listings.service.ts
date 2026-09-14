import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  CreateListingBody,
  ListingDetail,
  ListingSearchQuery,
  ListingSummary,
  ListingTransition,
  ListingTransitionBody,
  Locale,
  Page,
  Role,
  UpdateListingBody,
} from '@smartestate/contracts';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { uuidV7 } from '../../common/ids/uuid-v7.js';
import { toPage } from '../../common/pagination/cursor.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../admin/audit.service.js';
import type { ListingRow } from './listing-row.js';
import { applyTransition, initialStatus } from './listing-lifecycle.js';
import {
  activeListingQuota,
  assertCan,
  can,
  ListingQuotaExceededError,
  type ListingAction,
  type ListingSubject,
} from './listing.policy.js';
import { toListingDetail, toListingSummary } from './listing.mapper.js';
import { ListingsRepository } from './listings.repository.js';
import { cursorOf, type SearchScope } from './search-query.builder.js';

const PUBLIC_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function generatePublicId(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += PUBLIC_ID_ALPHABET.charAt(Math.floor(random() * PUBLIC_ID_ALPHABET.length));
  }
  return `L-${code}`;
}

/** Roles that may browse listings in a status other than PUBLISHED. */
const MODERATION_ROLES: ReadonlySet<Role> = new Set<Role>(['MODERATOR', 'ADMIN']);

/** Which policy action each lifecycle transition is authorised as. */
const TRANSITION_ACTIONS: Readonly<Record<ListingTransition, ListingAction>> = {
  SUBMIT: 'submit',
  PUBLISH: 'publish',
  APPROVE: 'approve',
  REJECT: 'reject',
  REVISE: 'revise',
  ARCHIVE: 'archive',
};

/**
 * Transitions that put a listing into a status counting against the owner's
 * allowance, and so have to be refused when the allowance is used up.
 */
const QUOTA_CONSUMING: ReadonlySet<ListingTransition> = new Set<ListingTransition>([
  'SUBMIT',
  'PUBLISH',
]);

/** The attributes the policy reasons about, extracted from a database row. */
export function subjectOf(row: ListingRow): ListingSubject {
  return { status: row.status, ownerId: row.created_by_id };
}

@Injectable()
export class ListingsService {
  constructor(
    private readonly repository: ListingsRepository,
    private readonly audit: AuditService,
  ) {}

  async search(
    query: ListingSearchQuery,
    viewer: AuthenticatedUser | undefined,
    locale: Locale,
  ): Promise<Page<ListingSummary>> {
    const { effective, scope } = scopeSearch(query, viewer);
    const rows = await this.repository.search(effective, scope);
    const page = toPage(rows, effective.limit, cursorOf(effective.sort));
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
    // A listing the caller may not view is reported as absent rather than as
    // forbidden, so the endpoint does not confirm that an unpublished listing exists.
    if (row === undefined || !can(viewer, 'view', subjectOf(row)).allowed) {
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
    const status = initialStatus(actor.role);
    assertCan(actor, 'create', { status, ownerId: actor.id });
    await this.assertQuota(actor);

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
    const now = new Date();
    const priceAmd = BigInt(body.priceAmd);
    await this.repository.insertListing(
      {
        id,
        publicId: generatePublicId(),
        buildingId: body.buildingId,
        createdById: actor.id,
        status,
        // A listing that goes straight into the queue was submitted by the act
        // of creating it; one an agent publishes never enters the queue.
        submittedAt: status === 'PENDING_REVIEW' ? now : null,
        publishedAt: now,
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
      metadata: { status },
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
    const row = await this.require(id, actor, 'update');
    if (body.floor !== undefined && body.floor > row.b_total_floors) {
      throw new BadRequestException({
        message: `Floor ${String(body.floor)} exceeds the building's ${String(row.b_total_floors)} floors`,
        code: 'FLOOR_OUT_OF_RANGE',
      });
    }

    const { translations, priceAmd, ...attributes } = body;
    const data: Prisma.ListingUpdateInput = { ...attributes };
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

  /**
   * The only way a listing changes status.
   *
   * Three checks run in a fixed order, and each has its own answer: the listing
   * must be visible (404), the caller must be permitted the action (403), and
   * the transition must be legal from the current status (409).
   */
  async transition(
    id: string,
    body: ListingTransitionBody,
    actor: AuthenticatedUser,
    ipAddress: string | undefined,
    locale: Locale,
  ): Promise<ListingDetail> {
    const row = await this.require(id, actor, TRANSITION_ACTIONS[body.action]);
    if (QUOTA_CONSUMING.has(body.action)) {
      await this.assertQuota(actor);
    }
    const change = applyTransition(row.status, body.action, {
      actorId: actor.id,
      now: new Date(),
      reason: body.reason,
    });
    await this.repository.applyStateChange(id, change);
    await this.audit.record({
      actorId: actor.id,
      action: `listing.${body.action.toLowerCase()}`,
      entityType: 'listing',
      entityId: id,
      metadata: { from: row.status, to: change.status },
      ipAddress: ipAddress ?? null,
    });
    return this.getDetail(id, actor, locale);
  }

  /** Soft delete: the listing is archived, and its price history stays for analytics. */
  async archive(
    id: string,
    actor: AuthenticatedUser,
    ipAddress: string | undefined,
  ): Promise<void> {
    const row = await this.require(id, actor, 'archive');
    // Archiving something already archived is the state the caller asked for.
    if (row.status !== 'ARCHIVED') {
      const change = applyTransition(row.status, 'ARCHIVE', { actorId: actor.id, now: new Date() });
      await this.repository.applyStateChange(id, change);
    }
    await this.audit.record({
      actorId: actor.id,
      action: 'listing.archive',
      entityType: 'listing',
      entityId: id,
      ipAddress: ipAddress ?? null,
    });
  }

  /** Hard delete, administrators only. Every dependent row goes with it. */
  async destroy(
    id: string,
    actor: AuthenticatedUser,
    ipAddress: string | undefined,
  ): Promise<void> {
    await this.require(id, actor, 'delete');
    // Audited before the row disappears, so the trail survives the listing.
    await this.audit.record({
      actorId: actor.id,
      action: 'listing.delete',
      entityType: 'listing',
      entityId: id,
      ipAddress: ipAddress ?? null,
    });
    await this.repository.deleteListing(id);
  }

  /** Loads a listing and authorises one action against it. */
  private async require(
    id: string,
    actor: AuthenticatedUser,
    action: ListingAction,
  ): Promise<ListingRow> {
    const row = await this.repository.findRowById(id);
    if (row === undefined || !can(actor, 'view', subjectOf(row)).allowed) {
      throw new NotFoundException({ message: 'Listing not found', code: 'NOT_FOUND' });
    }
    assertCan(actor, action, subjectOf(row));
    return row;
  }

  /** Refuses the action when the actor's allowance of live listings is used up. */
  private async assertQuota(actor: AuthenticatedUser): Promise<void> {
    const limit = activeListingQuota(actor.role);
    if (limit === null) {
      return;
    }
    const current = await this.repository.countLiveListings(actor.id);
    if (current >= limit) {
      throw new ListingQuotaExceededError(limit, current);
    }
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

/**
 * Decides what a caller is actually allowed to search.
 *
 * The status filter is a user-supplied value, so on its own it would let anyone
 * list other people's drafts. Ordinary callers are therefore narrowed to
 * PUBLISHED; `mine` trades that for a filter on ownership, which is what makes a
 * "my listings" screen possible without a second endpoint.
 */
export function scopeSearch(
  query: ListingSearchQuery,
  viewer: AuthenticatedUser | undefined,
): { effective: ListingSearchQuery; scope: SearchScope } {
  if (query.mine) {
    if (viewer === undefined) {
      throw new UnauthorizedException({
        message: 'Sign in to see your own listings',
        code: 'UNAUTHENTICATED',
      });
    }
    return { effective: query, scope: { ownerId: viewer.id } };
  }
  if (viewer !== undefined && MODERATION_ROLES.has(viewer.role)) {
    return { effective: query, scope: {} };
  }
  return { effective: { ...query, status: 'PUBLISHED' }, scope: {} };
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
