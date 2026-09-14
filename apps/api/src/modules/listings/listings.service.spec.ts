import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import type { AuditService } from '../admin/audit.service.js';
import type { ListingRow } from './listing-row.js';
import type { ListingsRepository } from './listings.repository.js';
import {
  canEdit,
  canView,
  generatePublicId,
  ListingsService,
  pricePerSqm,
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

const row: ListingRow = {
  id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e6f',
  public_id: 'L-ABC234',
  status: 'ACTIVE',
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
    findBuilding: vi.fn().mockResolvedValue({ id: 'b1', total_floors: 9 }),
  };
}

describe('helpers', () => {
  it('generatePublicId produces the documented format from the unambiguous alphabet', () => {
    expect(generatePublicId()).toMatch(/^L-[A-HJ-NP-Z2-9]{6}$/);
    expect(generatePublicId(() => 0)).toBe('L-AAAAAA');
  });

  it('pricePerSqm rounds and rejects a non-positive area', () => {
    expect(pricePerSqm(45_000_000, 72)).toBe(625_000);
    expect(() => pricePerSqm(1, 0)).toThrow(BadRequestException);
  });

  it('canView hides non-active listings from anonymous users and strangers', () => {
    const draft = { ...row, status: 'DRAFT' } as ListingRow;
    expect(canView(row, undefined)).toBe(true);
    expect(canView(draft, undefined)).toBe(false);
    expect(canView(draft, stranger)).toBe(false);
    expect(canView(draft, owner)).toBe(true);
    expect(canView(draft, moderator)).toBe(true);
  });

  it('canEdit allows the owner and moderation roles only', () => {
    expect(canEdit(row, owner)).toBe(true);
    expect(canEdit(row, stranger)).toBe(false);
    expect(canEdit(row, moderator)).toBe(true);
  });
});

describe('ListingsService', () => {
  let repository: ReturnType<typeof createRepositoryMock>;
  let audit: { record: ReturnType<typeof vi.fn> };
  let service: ListingsService;

  beforeEach(() => {
    repository = createRepositoryMock();
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    service = new ListingsService(
      repository as unknown as ListingsRepository,
      audit as unknown as AuditService,
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
      translations: [
        { locale: 'en' as const, title: 'Nice flat', description: 'Very nice indeed' },
      ],
    };
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

  it('update enforces ownership, recomputes price per m² and records history only on price changes', async () => {
    await expect(
      service.update(row.id, { status: 'SOLD' }, stranger, undefined, 'en'),
    ).rejects.toBeInstanceOf(ForbiddenException);

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

    await service.update(
      row.id,
      { priceAmd: 45_000_000, totalArea: 80 },
      moderator,
      undefined,
      'en',
    );
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

  it('withdraw is a soft delete and idempotent', async () => {
    await service.withdraw(row.id, owner, undefined);
    expect(repository.updateListing).toHaveBeenCalledWith(
      row.id,
      { status: 'WITHDRAWN' },
      undefined,
      undefined,
    );

    repository.updateListing.mockClear();
    repository.findRowById.mockResolvedValue({ ...row, status: 'WITHDRAWN' });
    await service.withdraw(row.id, owner, undefined);
    expect(repository.updateListing).not.toHaveBeenCalled();
  });

  it('search hydrates a page with translations and thumbnails', async () => {
    repository.search.mockResolvedValue([
      row,
      { ...row, id: '018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e70' },
    ]);
    repository.findTranslations.mockResolvedValue([
      { listingId: row.id, locale: 'en', title: 'T', description: 'D', source: 'HUMAN' },
    ]);
    const page = await service.search({ limit: 1, sort: 'published_desc', status: 'ACTIVE' }, 'en');
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.title).toBe('T');
    expect(page.nextCursor).not.toBeNull();
    expect(repository.findTranslations).toHaveBeenCalledWith([row.id]);
  });
});
