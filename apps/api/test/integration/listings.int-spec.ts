import type {
  ApiError,
  Building,
  ListingDetail,
  ListingSummary,
  Page,
} from '@smartestate/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { registerUser, startTestApp, type TestApp } from './setup/test-app.js';

type ListingsPage = Page<ListingSummary>;

/** Republic Square, Kentron. */
const KENTRON_POINT = { lat: 40.1776, lon: 44.5126 };

describe('listings search', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const search = async (query: string): Promise<ListingsPage> => {
    const response = await app.request('GET', `/api/listings${query}`);
    expect(response.statusCode).toBe(200);
    return response.json<ListingsPage>();
  };

  it('returns the first page of published listings, newest first, with a continuation cursor', async () => {
    const page = await search('');
    expect(page.items).toHaveLength(20);
    expect(page.nextCursor).not.toBeNull();
    expect(page.items.every((item) => item.status === 'PUBLISHED')).toBe(true);
    const dates = page.items.map((item) => item.publishedAt);
    expect([...dates].sort().reverse()).toEqual(dates);
    const first = page.items[0];
    expect(first?.title.length).toBeGreaterThan(0);
    expect(first?.district.slug.length).toBeGreaterThan(0);
    // The catalogue serves its own imagery, so a demonstration needs no
    // internet and no placeholder service decides what a listing looks like.
    expect(first?.thumbnailUrl).toMatch(/^\/listings\//);
  });

  it('applies structured filters', async () => {
    const kentron = await search('?districts=kentron&limit=50');
    expect(kentron.items.length).toBeGreaterThan(0);
    expect(kentron.items.every((item) => item.district.slug === 'kentron')).toBe(true);

    const priced = await search(
      '?priceMin=30000000&priceMax=60000000&roomsMin=2&roomsMax=3&limit=50',
    );
    expect(priced.items.length).toBeGreaterThan(0);
    for (const item of priced.items) {
      expect(item.priceAmd).toBeGreaterThanOrEqual(30_000_000);
      expect(item.priceAmd).toBeLessThanOrEqual(60_000_000);
      expect(item.rooms).toBeGreaterThanOrEqual(2);
      expect(item.rooms).toBeLessThanOrEqual(3);
    }

    const panel = await search(
      '?buildingTypes=PANEL,KHRUSHCHYOVKA&excludeGroundFloor=true&excludeTopFloor=true&limit=50',
    );
    expect(panel.items.length).toBeGreaterThan(0);
    for (const item of panel.items) {
      expect(['PANEL', 'KHRUSHCHYOVKA']).toContain(item.buildingType);
      expect(item.floor).toBeGreaterThan(1);
      expect(item.floor).toBeLessThan(item.totalFloors);
    }
  });

  it('sorts by price and walks every page exactly once with the cursor', async () => {
    const seen = new Set<string>();
    let cursor: string | null = null;
    let previousPrice = 0;
    let pages = 0;
    do {
      const page: ListingsPage = await search(
        `?districts=nubarashen,nork-marash,avan&sort=price_asc&limit=10${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`,
      );
      pages += 1;
      for (const item of page.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
        expect(item.priceAmd).toBeGreaterThanOrEqual(previousPrice);
        previousPrice = item.priceAmd;
      }
      cursor = page.nextCursor;
    } while (cursor !== null && pages < 10);

    // Seed calibration: 5 + 10 + 15 listings in those districts.
    expect(seen.size).toBe(30);
    expect(pages).toBe(3);
  });

  it('supports radius and bounding-box searches', async () => {
    const anchor = (await search('?districts=kentron&limit=1')).items[0];
    expect(anchor).toBeDefined();
    const { lat, lon } = anchor?.location ?? { lat: 0, lon: 0 };

    const near = await search(
      `?nearLat=${String(lat)}&nearLon=${String(lon)}&radiusM=500&limit=50`,
    );
    expect(near.items.some((item) => item.id === anchor?.id)).toBe(true);

    const bbox = await search(
      `?bbox=${String(lon - 0.002)},${String(lat - 0.002)},${String(lon + 0.002)},${String(lat + 0.002)}&limit=50`,
    );
    expect(bbox.items.some((item) => item.id === anchor?.id)).toBe(true);
    for (const item of bbox.items) {
      expect(item.location.lat).toBeGreaterThanOrEqual(lat - 0.002);
      expect(item.location.lat).toBeLessThanOrEqual(lat + 0.002);
    }

    const incomplete = await app.request('GET', '/api/listings?nearLat=40.18');
    expect(incomplete.statusCode).toBe(400);
  });

  it('localises titles by query parameter, then Accept-Language, then Armenian by default', async () => {
    const ru = await search('?locale=ru&limit=1');
    expect(ru.items[0]?.locale).toBe('ru');
    expect(ru.items[0]?.title).toContain('квартира');

    const response = await app.request('GET', '/api/listings?limit=1', {
      headers: { 'accept-language': 'en-GB,en;q=0.9' },
    });
    const en = response.json<ListingsPage>();
    expect(en.items[0]?.locale).toBe('en');
    expect(en.items[0]?.title).toContain('apartment');

    const hy = await search('?limit=1');
    expect(hy.items[0]?.locale).toBe('hy');
    expect(hy.items[0]?.title).toContain('բնակարան');
  });

  it('serves details by id and by public id, and 404s unknown ids', async () => {
    const summary = (await search('?limit=1')).items[0];
    expect(summary).toBeDefined();

    const byId = await app.request('GET', `/api/listings/${summary?.id ?? ''}`);
    expect(byId.statusCode).toBe(200);
    const detail = byId.json<ListingDetail>();
    expect(detail.publicId).toBe(summary?.publicId);
    expect(detail.translations).toHaveLength(3);
    expect(detail.media.length).toBeGreaterThanOrEqual(3);
    expect(detail.priceHistory.length).toBeGreaterThanOrEqual(1);
    expect(detail.building.totalFloors).toBe(summary?.totalFloors);

    const byPublicId = await app.request(
      'GET',
      `/api/listings/${summary?.publicId ?? ''}?locale=en`,
    );
    expect(byPublicId.statusCode).toBe(200);
    expect(byPublicId.json<ListingDetail>().id).toBe(summary?.id);
    expect(byPublicId.json<ListingDetail>().locale).toBe('en');

    expect(
      (await app.request('GET', '/api/listings/018f6d3e-7b6c-7c3a-9a0e-1f2b3c4d5e6f')).statusCode,
    ).toBe(404);
    expect((await app.request('GET', '/api/listings/not-an-id')).statusCode).toBe(400);
  });
});

describe('listings management', () => {
  let app: TestApp;

  beforeAll(async () => {
    app = await startTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const buildingBody = () => ({
    street: { hy: 'Թեստ', ru: 'Тестовая', en: 'Test' },
    houseNumber: `${String(Date.now())}-${String(Math.floor(Math.random() * 1000))}`,
    buildingType: 'MONOLITH',
    constructionYear: 2019,
    totalFloors: 12,
    hasElevator: true,
    location: KENTRON_POINT,
  });

  const listingBody = (buildingId: string) => ({
    buildingId,
    priceAmd: 58_000_000,
    totalArea: 74.5,
    rooms: 3,
    floor: 7,
    condition: 'EURO_RENOVATION',
    heating: 'INDIVIDUAL_GAS_BOILER',
    balconyCount: 1,
    translations: [
      {
        locale: 'en',
        title: 'Bright three-room flat near Republic Square',
        description: 'Renovated apartment on the seventh floor.',
      },
      {
        locale: 'hy',
        title: 'Լուսավոր 3 սենյականոց բնակարան',
        description: 'Վերանորոգված բնակարան յոթերորդ հարկում։',
      },
    ],
  });

  it('requires an agent role to register buildings and publish listings', async () => {
    const user = await registerUser(app);
    expect((await app.request('POST', '/api/buildings', { body: buildingBody() })).statusCode).toBe(
      401,
    );
    expect(
      (
        await app.request('POST', '/api/buildings', {
          token: user.accessToken,
          body: buildingBody(),
        })
      ).statusCode,
    ).toBe(403);
  });

  it('derives the district from coordinates and rejects points outside coverage', async () => {
    const agent = await registerUser(app, { role: 'AGENT' });
    const created = await app.request('POST', '/api/buildings', {
      token: agent.accessToken,
      body: buildingBody(),
    });
    expect(created.statusCode).toBe(201);
    const building = created.json<Building>();
    expect(building.location.lat).toBeCloseTo(KENTRON_POINT.lat, 5);

    const districts = await app.request('GET', '/api/districts');
    const kentron = districts
      .json<{ id: string; slug: string }[]>()
      .find((d) => d.slug === 'kentron');
    expect(building.districtId).toBe(kentron?.id);

    const fetched = await app.request('GET', `/api/buildings/${building.id}`);
    expect(fetched.statusCode).toBe(200);

    const outside = await app.request('POST', '/api/buildings', {
      token: agent.accessToken,
      body: { ...buildingBody(), location: { lat: 0, lon: 0 } },
    });
    expect(outside.statusCode).toBe(422);
    expect(outside.json<ApiError>().code).toBe('OUTSIDE_COVERAGE');
  });

  it('creates, updates and archives a listing with ownership rules and price history', async () => {
    const owner = await registerUser(app, { role: 'AGENT' });
    const stranger = await registerUser(app, { role: 'AGENT' });
    const building = (
      await app.request('POST', '/api/buildings', {
        token: owner.accessToken,
        body: buildingBody(),
      })
    ).json<Building>();

    const created = await app.request('POST', '/api/listings', {
      token: owner.accessToken,
      body: listingBody(building.id),
    });
    expect(created.statusCode).toBe(201);
    const listing = created.json<ListingDetail>();
    expect(listing.pricePerSqmAmd).toBe(Math.round(58_000_000 / 74.5));
    expect(listing.createdById).toBe(owner.user.id);
    expect(listing.translations.map((t) => t.locale).sort()).toEqual(['en', 'hy']);
    expect(listing.priceHistory).toHaveLength(1);
    // Response locale follows the agent's account preference (hy) unless ?locale overrides it.
    expect(listing.locale).toBe('hy');

    const tooHigh = await app.request('POST', '/api/listings', {
      token: owner.accessToken,
      body: { ...listingBody(building.id), floor: 13 },
    });
    expect(tooHigh.statusCode).toBe(400);
    expect(tooHigh.json<ApiError>().code).toBe('FLOOR_OUT_OF_RANGE');

    const invalid = await app.request('POST', '/api/listings', {
      token: owner.accessToken,
      body: { ...listingBody(building.id), rooms: 0 },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json<ApiError>().details?.[0]?.path).toBe('rooms');

    const forbidden = await app.request('PATCH', `/api/listings/${listing.id}`, {
      token: stranger.accessToken,
      body: { priceAmd: 1 },
    });
    expect(forbidden.statusCode).toBe(403);

    const updated = await app.request('PATCH', `/api/listings/${listing.id}?locale=ru`, {
      token: owner.accessToken,
      body: {
        priceAmd: 55_000_000,
        translations: [
          {
            locale: 'ru',
            title: 'Светлая трёхкомнатная квартира',
            description: 'Отремонтированная квартира на седьмом этаже.',
          },
        ],
      },
    });
    expect(updated.statusCode).toBe(200);
    const afterUpdate = updated.json<ListingDetail>();
    expect(afterUpdate.priceAmd).toBe(55_000_000);
    expect(afterUpdate.pricePerSqmAmd).toBe(Math.round(55_000_000 / 74.5));
    expect(afterUpdate.priceHistory.map((h) => h.priceAmd)).toEqual([58_000_000, 55_000_000]);
    expect(afterUpdate.locale).toBe('ru');
    expect(afterUpdate.translations).toHaveLength(3);

    const visible = await app.request(
      'GET',
      `/api/listings?districts=kentron&sort=published_desc&limit=5`,
    );
    expect(visible.json<ListingsPage>().items.some((item) => item.id === listing.id)).toBe(true);

    const archived = await app.request('DELETE', `/api/listings/${listing.id}`, {
      token: owner.accessToken,
    });
    expect(archived.statusCode).toBe(204);
    expect((await app.request('GET', `/api/listings/${listing.id}`)).statusCode).toBe(404);
    const asOwner = await app.request('GET', `/api/listings/${listing.id}`, {
      token: owner.accessToken,
    });
    expect(asOwner.statusCode).toBe(200);
    expect(asOwner.json<ListingDetail>().status).toBe('ARCHIVED');
    const gone = await app.request(
      'GET',
      `/api/listings?districts=kentron&sort=published_desc&limit=5`,
    );
    expect(gone.json<ListingsPage>().items.some((item) => item.id === listing.id)).toBe(false);

    const audit = await app
      .prisma()
      .auditLog.findMany({ where: { entityId: listing.id }, orderBy: { createdAt: 'asc' } });
    expect(audit.map((a) => a.action)).toEqual([
      'listing.create',
      'listing.update',
      'listing.archive',
    ]);
  });

  it('puts a listing from a regular user through review before anyone else can see it', async () => {
    const author = await registerUser(app);
    const moderator = await registerUser(app, { role: 'MODERATOR' });
    const agent = await registerUser(app, { role: 'AGENT' });
    const building = (
      await app.request('POST', '/api/buildings', {
        token: agent.accessToken,
        body: buildingBody(),
      })
    ).json<Building>();

    const created = await app.request('POST', '/api/listings', {
      token: author.accessToken,
      body: listingBody(building.id),
    });
    expect(created.statusCode).toBe(201);
    const listing = created.json<ListingDetail>();
    expect(listing.status).toBe('PENDING_REVIEW');
    expect(listing.submittedAt).not.toBeNull();

    // Hidden from the public, visible to its author.
    expect((await app.request('GET', `/api/listings/${listing.id}`)).statusCode).toBe(404);
    expect(
      (await app.request('GET', `/api/listings/${listing.id}`, { token: author.accessToken }))
        .statusCode,
    ).toBe(200);

    // The author finds it under "my listings", nobody finds it through ordinary search.
    const mine = await app.request(
      'GET',
      '/api/listings?mine=true&status=PENDING_REVIEW&limit=50',
      {
        token: author.accessToken,
      },
    );
    expect(mine.json<ListingsPage>().items.some((item) => item.id === listing.id)).toBe(true);
    const publicSearch = await app.request('GET', '/api/listings?status=PENDING_REVIEW&limit=50');
    expect(publicSearch.json<ListingsPage>().items.some((item) => item.id === listing.id)).toBe(
      false,
    );

    // An author cannot approve their own listing.
    const selfApprove = await app.request('POST', `/api/listings/${listing.id}/transitions`, {
      token: author.accessToken,
      body: { action: 'APPROVE' },
    });
    expect(selfApprove.statusCode).toBe(403);

    // A rejection without a reason fails validation before it reaches the machine.
    const noReason = await app.request('POST', `/api/listings/${listing.id}/transitions`, {
      token: moderator.accessToken,
      body: { action: 'REJECT' },
    });
    expect(noReason.statusCode).toBe(400);

    const rejected = await app.request('POST', `/api/listings/${listing.id}/transitions`, {
      token: moderator.accessToken,
      body: { action: 'REJECT', reason: 'The photographs do not match the description.' },
    });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json<ListingDetail>().status).toBe('REJECTED');
    expect(rejected.json<ListingDetail>().rejectionReason).toContain('photographs');

    // REJECTED is not a state you can approve out of: a conflict, not a bad request.
    const illegal = await app.request('POST', `/api/listings/${listing.id}/transitions`, {
      token: moderator.accessToken,
      body: { action: 'APPROVE' },
    });
    expect(illegal.statusCode).toBe(409);
    expect(illegal.json<ApiError>().code).toBe('ILLEGAL_LISTING_TRANSITION');

    const revised = await app.request('POST', `/api/listings/${listing.id}/transitions`, {
      token: author.accessToken,
      body: { action: 'REVISE' },
    });
    expect(revised.statusCode).toBe(200);
    expect(revised.json<ListingDetail>().status).toBe('DRAFT');
    expect(revised.json<ListingDetail>().rejectionReason).toBeNull();

    // A regular user may not skip review; they resubmit instead.
    const selfPublish = await app.request('POST', `/api/listings/${listing.id}/transitions`, {
      token: author.accessToken,
      body: { action: 'PUBLISH' },
    });
    expect(selfPublish.statusCode).toBe(403);

    expect(
      (
        await app.request('POST', `/api/listings/${listing.id}/transitions`, {
          token: author.accessToken,
          body: { action: 'SUBMIT' },
        })
      ).statusCode,
    ).toBe(200);
    const approved = await app.request('POST', `/api/listings/${listing.id}/transitions`, {
      token: moderator.accessToken,
      body: { action: 'APPROVE' },
    });
    expect(approved.statusCode).toBe(200);
    const published = approved.json<ListingDetail>();
    expect(published.status).toBe('PUBLISHED');
    expect(published.reviewedAt).not.toBeNull();

    expect((await app.request('GET', `/api/listings/${listing.id}`)).statusCode).toBe(200);
  });

  it('stops a regular user at three live listings', async () => {
    const author = await registerUser(app);
    const agent = await registerUser(app, { role: 'AGENT' });
    const building = (
      await app.request('POST', '/api/buildings', {
        token: agent.accessToken,
        body: buildingBody(),
      })
    ).json<Building>();

    for (let i = 0; i < 3; i += 1) {
      const response = await app.request('POST', '/api/listings', {
        token: author.accessToken,
        body: listingBody(building.id),
      });
      expect(response.statusCode).toBe(201);
    }
    const fourth = await app.request('POST', '/api/listings', {
      token: author.accessToken,
      body: listingBody(building.id),
    });
    expect(fourth.statusCode).toBe(409);
    const error = fourth.json<ApiError>();
    expect(error.code).toBe('LISTING_QUOTA_EXCEEDED');
    expect(error.context).toMatchObject({ limit: 3, current: 3 });
  });

  it('lets an administrator delete a listing permanently, and nobody else', async () => {
    const agent = await registerUser(app, { role: 'AGENT' });
    const admin = await registerUser(app, { role: 'ADMIN' });
    const building = (
      await app.request('POST', '/api/buildings', {
        token: agent.accessToken,
        body: buildingBody(),
      })
    ).json<Building>();
    const listing = (
      await app.request('POST', '/api/listings', {
        token: agent.accessToken,
        body: listingBody(building.id),
      })
    ).json<ListingDetail>();
    expect(listing.status).toBe('PUBLISHED');

    expect(
      (
        await app.request('DELETE', `/api/listings/${listing.id}/permanent`, {
          token: agent.accessToken,
        })
      ).statusCode,
    ).toBe(403);

    expect(
      (
        await app.request('DELETE', `/api/listings/${listing.id}/permanent`, {
          token: admin.accessToken,
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (await app.request('GET', `/api/listings/${listing.id}`, { token: admin.accessToken }))
        .statusCode,
    ).toBe(404);
  });
});
