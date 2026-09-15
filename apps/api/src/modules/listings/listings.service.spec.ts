import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ListingSearchQuery } from '@smartestate/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import type { AuditService } from '../admin/audit.service.js';
import type { EmbeddingsService } from '../embeddings/embeddings.service.js';
import type { ListingRow } from './listing-row.js';
import { IllegalListingTransitionError } from './listing-lifecycle.js';
import { ListingAccessDeniedError, ListingQuotaExceededError } from './listing.policy.js';
import type { ListingsRepository } from './listings.repository.js';
import {
  generatePublicId,
  ListingsService,
  pricePerSqm,
  scopeSearch,
  subjectOf,
} from './listings.service.js';

const owner: AuthenticatedUser = {
  id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e01',
  email: 'a@b.co',
  role: 'AGENT',
  locale: 'en',
};
const stranger: AuthenticatedUser = {
  id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e02',
  email: 'c@d.co',
  role: 'AGENT',
  locale: 'en',
};
const moderator: AuthenticatedUser = {
  id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e03',
  email: 'm@d.co',
  role: 'MODERATOR',
  locale: 'en',
};
const member: AuthenticatedUser = {
  id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e04',
  email: 'u@d.co',
  role: 'USER',
  locale: 'en',
};

const row: ListingRow = {
  id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e6f',
  public_id: 'L-ABC234',
  status: 'PUBLISHED',
  price_amd: 45_000_000n,
  price_per_sqm_amd: 625_000,
  original_currency: 'AMD',
  original_price: null,
  price_negotiable: false,
  rooms: 3,
  bathrooms: 1,
  total_area: { toString: () => '72.00' },
  living_area: null,
  kitchen_area: null,
  ceiling_height: null,
  floor: 4,
  balcony_count: 1,
  has_loggia: false,
  has_parking: false,
  has_storage: false,
  condition: 'GOOD',
  heating: 'ELECTRIC',
  ownership_docs: 'UNVERIFIED',
  lon: 44.51,
  lat: 40.18,
  published_at: new Date('2026-08-20T10:00:00.000Z'),
  submitted_at: null,
  reviewed_at: null,
  reviewed_by_id: null,
  rejection_reason: null,
  created_at: new Date(),
  updated_at: new Date(),
  created_by_id: owner.id,
  building_id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e70',
  district_id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e71',
  b_address_line: 'Komitas 12',
  b_street_hy: 'Կոմիտաս',
  b_street_ru: 'Комитаса',
  b_street_en: 'Komitas',
  b_house_number: '12',
  b_building_type: 'STONE',
  b_construction_year: 1978,
  b_total_floors: 9,
  b_has_elevator: true,
  b_seismic_retrofit: false,
  b_lon: 44.51,
  b_lat: 40.18,
  d_slug: 'arabkir',
  d_name_hy: 'Արաբկիր',
  d_name_ru: 'Арабкир',
  d_name_en: 'Arabkir',
};

const query = (overrides: Partial<ListingSearchQuery> = {}): ListingSearchQuery => ({
  limit: 20,
  sort: 'published_desc',
  status: 'PUBLISHED',
  mine: false,
  ...overrides,
});

function createRepositoryMock() {
  return {
    search: vi.fn().mockResolvedValue([]),
    findRowById: vi.fn().mockResolvedValue(row),
    findRowByPublicId: vi.fn().mockResolvedValue(row),
    findTranslations: vi.fn().mockResolvedValue([]),
    findThumbnails: vi.fn().mockResolvedValue([]),
    findMedia: vi.fn().mockResolvedValue([]),
    findPriceHistory: vi.fn().mockResolvedValue([]),
    insertListing: vi.fn().mockResolvedValue(undefined),
    updateListing: vi.fn().mockResolvedValue(undefined),
    applyStateChange: vi.fn().mockResolvedValue(undefined),
    deleteListing: vi.fn().mockResolvedValue(undefined),
    countLiveListings: vi.fn().mockResolvedValue(0),
    findBuilding: vi.fn().mockResolvedValue({ id: 'b1', total_floors: 9 }),
  };
}

const body = {
  buildingId: 'b1',
  priceAmd: 45_000_000,
  priceNegotiable: false,
  originalCurrency: 'AMD' as const,
  originalPrice: null,
  totalArea: 72,
  livingArea: null,
  kitchenArea: null,
  rooms: 3,
  bathrooms: 1,
  ceilingHeight: null,
  floor: 4,
  balconyCount: 1,
  hasLoggia: false,
  hasParking: false,
  hasStorage: false,
  condition: 'GOOD' as const,
  heating: 'ELECTRIC' as const,
  ownershipDocs: 'UNVERIFIED' as const,
  translations: [{ locale: 'en' as const, title: 'Nice flat', description: 'Very nice indeed' }],
};

describe('helpers', () => {
  it('generatePublicId produces the documented format from the unambiguous alphabet', () => {
    expect(generatePublicId()).toMatch(/^L-[A-HJ-NP-Z2-9]{6}$/);
    expect(generatePublicId(() => 0)).toBe('L-AAAAAA');
  });

  it('pricePerSqm rounds and rejects a non-positive area', () => {
    expect(pricePerSqm(45_000_000, 72)).toBe(625_000);
    expect(() => pricePerSqm(1, 0)).toThrow(BadRequestException);
  });

  it('subjectOf reduces a row to the attributes the policy reads', () => {
    expect(subjectOf(row)).toEqual({ status: 'PUBLISHED', ownerId: owner.id });
  });
});

describe('scopeSearch', () => {
  it('forces published-only for anonymous and ordinary callers, whatever they asked for', () => {
    for (const viewer of [undefined, member, owner]) {
      const { effective, scope } = scopeSearch(query({ status: 'DRAFT' }), viewer);
      expect(effective.status).toBe('PUBLISHED');
      expect(scope.ownerId).toBeUndefined();
    }
  });

  it('lets a moderator filter by any status', () => {
    const { effective } = scopeSearch(query({ status: 'PENDING_REVIEW' }), moderator);
    expect(effective.status).toBe('PENDING_REVIEW');
  });

  it('narrows to the caller when they ask for their own listings', () => {
    const { effective, scope } = scopeSearch(query({ mine: true, status: 'DRAFT' }), member);
    expect(effective.status).toBe('DRAFT');
    expect(scope.ownerId).toBe(member.id);
  });

  it('refuses "my listings" without a session', () => {
    expect(() => scopeSearch(query({ mine: true }), undefined)).toThrow(UnauthorizedException);
  });
});

describe('ListingsService', () => {
  let repository: ReturnType<typeof createRepositoryMock>;
  let audit: { record: ReturnType<typeof vi.fn> };
  let embeddings: { embedListing: ReturnType<typeof vi.fn> };
  let service: ListingsService;

  beforeEach(() => {
    repository = createRepositoryMock();
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    embeddings = { embedListing: vi.fn().mockResolvedValue(undefined) };
    service = new ListingsService(
      repository as unknown as ListingsRepository,
      audit as unknown as AuditService,
      embeddings as unknown as EmbeddingsService,
    );
  });

  it('getDetail looks up by uuid or public id and 404s hidden listings', async () => {
    await service.getDetail(row.id, undefined, 'hy');
    expect(repository.findRowById).toHaveBeenCalledWith(row.id);
    await service.getDetail('L-ABC234', undefined, 'hy');
    expect(repository.findRowByPublicId).toHaveBeenCalledWith('L-ABC234');

    repository.findRowById.mockResolvedValue({ ...row, status: 'DRAFT' });
    await expect(service.getDetail(row.id, stranger, 'hy')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('create validates the building and floor, then inserts with derived price per m²', async () => {
    await service.create(body, owner, '127.0.0.1', 'en');
    const inserted = repository.insertListing.mock.calls[0]?.[0] as {
      pricePerSqmAmd: number;
      priceAmd: bigint;
      createdById: string;
    };
    expect(inserted.pricePerSqmAmd).toBe(625_000);
    expect(inserted.priceAmd).toBe(45_000_000n);
    expect(inserted.createdById).toBe(owner.id);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'listing.create' }),
    );

    await expect(
      service.create({ ...body, floor: 12 }, owner, undefined, 'en'),
    ).rejects.toBeInstanceOf(BadRequestException);
    repository.findBuilding.mockResolvedValue(undefined);
    await expect(service.create(body, owner, undefined, 'en')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('create publishes an agent’s listing and queues a user’s for review', async () => {
    await service.create(body, owner, undefined, 'en');
    expect(repository.insertListing.mock.calls[0]?.[0]).toMatchObject({
      status: 'PUBLISHED',
      submittedAt: null,
    });

    await service.create(body, member, undefined, 'en');
    const queued = repository.insertListing.mock.calls[1]?.[0] as {
      status: string;
      submittedAt: Date | null;
    };
    expect(queued.status).toBe('PENDING_REVIEW');
    expect(queued.submittedAt).toBeInstanceOf(Date);
  });

  it('create refuses once the account holds its allowance of live listings', async () => {
    repository.countLiveListings.mockResolvedValue(3);
    await expect(service.create(body, member, undefined, 'en')).rejects.toBeInstanceOf(
      ListingQuotaExceededError,
    );
    expect(repository.insertListing).not.toHaveBeenCalled();

    // The same count is well inside an agent's allowance.
    await expect(service.create(body, owner, undefined, 'en')).resolves.toBeDefined();
  });

  it('update enforces ownership, recomputes price per m² and records history only on price changes', async () => {
    await expect(
      service.update(row.id, { priceAmd: 1_000_000 }, stranger, undefined, 'en'),
    ).rejects.toBeInstanceOf(ListingAccessDeniedError);

    await service.update(row.id, { priceAmd: 40_000_000 }, owner, undefined, 'en');
    const first = repository.updateListing.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
      unknown,
      bigint | undefined,
    ];
    expect(first[1].priceAmd).toBe(40_000_000n);
    expect(first[1].pricePerSqmAmd).toBe(Math.round(40_000_000 / 72));
    expect(first[2]).toBeUndefined();
    expect(first[3]).toBe(40_000_000n);

    await service.update(row.id, { priceAmd: 45_000_000, totalArea: 80 }, owner, undefined, 'en');
    const second = repository.updateListing.mock.calls[1] as unknown as [
      string,
      Record<string, unknown>,
      unknown,
      bigint | undefined,
    ];
    expect(second[3]).toBeUndefined();
    expect(second[1].pricePerSqmAmd).toBe(562_500);

    await expect(
      service.update(row.id, { floor: 10 }, owner, undefined, 'en'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update does not let a moderator rewrite a listing they do not own', async () => {
    await expect(
      service.update(row.id, { priceAmd: 1 }, moderator, undefined, 'en'),
    ).rejects.toBeInstanceOf(ListingAccessDeniedError);
  });

  it('transition applies the state change and audits where the listing came from', async () => {
    repository.findRowById.mockResolvedValue({ ...row, status: 'PENDING_REVIEW' });
    await service.transition(row.id, { action: 'APPROVE' }, moderator, undefined, 'en');

    expect(repository.applyStateChange).toHaveBeenCalledWith(
      row.id,
      expect.objectContaining({ status: 'PUBLISHED', reviewedById: moderator.id }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'listing.approve',
        metadata: { from: 'PENDING_REVIEW', to: 'PUBLISHED' },
      }),
    );
  });

  it('transition refuses an illegal move as a conflict, not a validation error', async () => {
    let caught: unknown;
    try {
      // The fixture is PUBLISHED, so there is nothing to approve.
      await service.transition(row.id, { action: 'APPROVE' }, moderator, undefined, 'en');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(IllegalListingTransitionError);
    expect((caught as IllegalListingTransitionError).status).toBe(409);
    expect(repository.applyStateChange).not.toHaveBeenCalled();
  });

  it('transition refuses an unauthorised move before it looks at the state machine', async () => {
    repository.findRowById.mockResolvedValue({ ...row, status: 'PENDING_REVIEW' });
    await expect(
      service.transition(row.id, { action: 'APPROVE' }, owner, undefined, 'en'),
    ).rejects.toBeInstanceOf(ListingAccessDeniedError);
  });

  it('transition counts a submission against the owner’s allowance', async () => {
    repository.findRowById.mockResolvedValue({
      ...row,
      status: 'DRAFT',
      created_by_id: member.id,
    });
    repository.countLiveListings.mockResolvedValue(3);
    await expect(
      service.transition(row.id, { action: 'SUBMIT' }, member, undefined, 'en'),
    ).rejects.toBeInstanceOf(ListingQuotaExceededError);
  });

  it('archive is a soft delete and idempotent', async () => {
    await service.archive(row.id, owner, undefined);
    expect(repository.applyStateChange).toHaveBeenCalledWith(row.id, { status: 'ARCHIVED' });

    repository.applyStateChange.mockClear();
    repository.findRowById.mockResolvedValue({ ...row, status: 'ARCHIVED' });
    await service.archive(row.id, owner, undefined);
    expect(repository.applyStateChange).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'listing.archive' }),
    );
  });

  it('destroy is refused to everyone but an administrator, and audits before the row goes', async () => {
    await expect(service.destroy(row.id, moderator, undefined)).rejects.toBeInstanceOf(
      ListingAccessDeniedError,
    );
    expect(repository.deleteListing).not.toHaveBeenCalled();

    const admin: AuthenticatedUser = { ...moderator, role: 'ADMIN' };
    await service.destroy(row.id, admin, undefined);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'listing.delete' }),
    );
    expect(repository.deleteListing).toHaveBeenCalledWith(row.id);
  });

  it('search hydrates a page with translations and thumbnails', async () => {
    repository.search.mockResolvedValue([
      row,
      { ...row, id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e70' },
    ]);
    repository.findTranslations.mockResolvedValue([
      { listingId: row.id, locale: 'en', title: 'T', description: 'D', source: 'HUMAN' },
    ]);
    const page = await service.search(query({ limit: 1 }), undefined, 'en');
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.title).toBe('T');
    expect(page.nextCursor).not.toBeNull();
    expect(repository.findTranslations).toHaveBeenCalledWith([row.id]);
  });

  it('search passes the ownership scope to the repository for "my listings"', async () => {
    await service.search(query({ mine: true, status: 'DRAFT' }), member, 'en');
    expect(repository.search).toHaveBeenCalledWith(expect.objectContaining({ status: 'DRAFT' }), {
      ownerId: member.id,
    });
  });
});
