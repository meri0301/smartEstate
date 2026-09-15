import type { PreferenceProfile } from '@smartestate/contracts';
import { describe, expect, it } from 'vitest';
import {
  buildingScore,
  clamp01,
  conditionScore,
  haversineMetres,
  locationScore,
  priceScore,
  roomsScore,
  sizeScore,
  valueScore,
} from './criteria.js';

const preferences = (overrides: Partial<PreferenceProfile> = {}): PreferenceProfile => ({
  budgetAmd: 50_000_000,
  roomsMin: 2,
  districts: [],
  weights: {
    price: 1,
    value: 1,
    size: 0.6,
    rooms: 0.8,
    location: 0.8,
    condition: 0.6,
    building: 0.4,
  },
  ...overrides,
});

describe('clamp01', () => {
  it.each([
    [-1, 0],
    [0, 0],
    [0.5, 0.5],
    [1, 1],
    [2, 1],
  ])('maps %s to %s', (input, expected) => {
    expect(clamp01(input)).toBe(expected);
  });

  it('treats a missing measurement as the worst case rather than propagating NaN', () => {
    expect(clamp01(Number.NaN)).toBe(0);
  });
});

describe('priceScore', () => {
  it('is the share of the budget left over, so a reader can check it', () => {
    expect(priceScore(25_000_000, 50_000_000)).toBe(0.5);
    expect(priceScore(40_000_000, 50_000_000)).toBeCloseTo(0.2, 10);
  });

  it('scores nothing at the budget and nothing above it', () => {
    expect(priceScore(50_000_000, 50_000_000)).toBe(0);
    expect(priceScore(80_000_000, 50_000_000)).toBe(0);
  });

  it('refuses to divide by a budget of nothing', () => {
    expect(priceScore(10_000_000, 0)).toBe(0);
  });
});

describe('valueScore', () => {
  it('is a half when the asking price matches the estimate', () => {
    expect(valueScore(0)).toBe(0.5);
  });

  it('rewards a listing priced below the estimate', () => {
    expect(valueScore(-20)).toBe(1);
    expect(valueScore(-10)).toBeCloseTo(0.75, 10);
  });

  it('punishes one priced above it', () => {
    expect(valueScore(20)).toBe(0);
    expect(valueScore(10)).toBeCloseTo(0.25, 10);
  });

  it('saturates rather than running away on an extreme listing', () => {
    expect(valueScore(-200)).toBe(1);
    expect(valueScore(500)).toBe(0);
  });

  it('is undefined when no estimate was available, rather than a made-up middle', () => {
    expect(valueScore(undefined)).toBeUndefined();
  });
});

describe('sizeScore', () => {
  it('scores nothing at the requested minimum and full marks at twice it', () => {
    expect(sizeScore(50, 50)).toBe(0);
    expect(sizeScore(100, 50)).toBe(1);
    expect(sizeScore(75, 50)).toBeCloseTo(0.5, 10);
  });

  it('does not reward a mansion beyond the saturation point', () => {
    expect(sizeScore(400, 50)).toBe(1);
  });

  it('falls back to a sensible floor when no minimum was given', () => {
    expect(sizeScore(60, undefined)).toBe(1);
    expect(sizeScore(30, undefined)).toBe(0);
  });
});

describe('roomsScore', () => {
  it('gives full marks anywhere inside the requested range', () => {
    expect(roomsScore(2, 2, 4)).toBe(1);
    expect(roomsScore(3, 2, 4)).toBe(1);
    expect(roomsScore(4, 2, 4)).toBe(1);
  });

  it('does not exclude a near miss, it demotes it', () => {
    expect(roomsScore(1, 2, 4)).toBeCloseTo(2 / 3, 10);
    expect(roomsScore(5, 2, 4)).toBeCloseTo(2 / 3, 10);
    expect(roomsScore(7, 2, 4)).toBe(0);
  });

  it('treats an open-ended range as open-ended', () => {
    expect(roomsScore(9, 2, undefined)).toBe(1);
  });
});

describe('locationScore', () => {
  const kentron = { lat: 40.1776, lon: 44.5126, districtSlug: 'kentron' };

  it('is one at the buyer’s anchor and falls with distance', () => {
    expect(locationScore(kentron, preferences({ anchor: { lat: 40.1776, lon: 44.5126 } }))).toBe(1);

    const nearby = locationScore(
      { ...kentron, lat: 40.2 },
      preferences({ anchor: { lat: 40.1776, lon: 44.5126 } }),
    );
    expect(nearby).toBeGreaterThan(0.5);
    expect(nearby).toBeLessThan(1);
  });

  it('reaches zero beyond the width of the city', () => {
    expect(
      locationScore(
        { ...kentron, lat: 41.0 },
        preferences({ anchor: { lat: 40.1776, lon: 44.5126 } }),
      ),
    ).toBe(0);
  });

  it('prefers an anchor over a district list when both were given', () => {
    const score = locationScore(
      kentron,
      preferences({ anchor: { lat: 41.0, lon: 44.5126 }, districts: ['kentron'] }),
    );
    expect(score).toBe(0);
  });

  it('falls back to the named districts', () => {
    expect(locationScore(kentron, preferences({ districts: ['kentron'] }))).toBe(1);
    expect(locationScore(kentron, preferences({ districts: ['avan'] }))).toBe(0);
  });

  it('is neutral when the buyer named nowhere, so the criterion does not sort anything', () => {
    expect(locationScore(kentron, preferences())).toBe(0.5);
  });
});

describe('haversineMetres', () => {
  it('is zero at the same point', () => {
    expect(haversineMetres({ lat: 40.1776, lon: 44.5126 }, { lat: 40.1776, lon: 44.5126 })).toBe(0);
  });

  it('matches the known length of a degree of latitude', () => {
    expect(haversineMetres({ lat: 40, lon: 44.5 }, { lat: 41, lon: 44.5 })).toBeCloseTo(
      111_195,
      -2,
    );
  });
});

describe('conditionScore', () => {
  it('orders the states of repair as the market does', () => {
    const order = ['NEEDS_REPAIR', 'OLD_RENOVATION', 'GOOD', 'EURO_RENOVATION', 'DESIGNER'];
    const scores = order.map(conditionScore);
    expect([...scores].sort((a, b) => a - b)).toEqual(scores);
  });

  it('puts an unrecognised value in the middle rather than at the bottom', () => {
    expect(conditionScore('SPOTLESS')).toBe(0.5);
  });
});

describe('buildingScore', () => {
  const base = {
    buildingType: 'STONE',
    constructionYear: 1990,
    totalFloors: 9,
    hasElevator: true,
    seismicRetrofit: false,
  };

  it('prefers newer construction to older', () => {
    expect(buildingScore({ ...base, constructionYear: 2020 })).toBeGreaterThan(
      buildingScore({ ...base, constructionYear: 1960 }),
    );
  });

  it('prefers the better building stock', () => {
    expect(buildingScore({ ...base, buildingType: 'NEW_BUILD' })).toBeGreaterThan(
      buildingScore({ ...base, buildingType: 'KHRUSHCHYOVKA' }),
    );
  });

  it('penalises a tall building with no lift, and does not penalise a low one', () => {
    expect(buildingScore({ ...base, hasElevator: false })).toBeLessThan(buildingScore(base));
    expect(buildingScore({ ...base, totalFloors: 4, hasElevator: false })).toBe(
      buildingScore({ ...base, totalFloors: 4, hasElevator: true }),
    );
  });

  it('rewards seismic strengthening, which is not decoration in Yerevan', () => {
    expect(buildingScore({ ...base, seismicRetrofit: true })).toBeGreaterThan(buildingScore(base));
  });

  it('stays inside the unit interval at both extremes', () => {
    expect(
      buildingScore({
        buildingType: 'NEW_BUILD',
        constructionYear: 2026,
        totalFloors: 3,
        hasElevator: true,
        seismicRetrofit: true,
      }),
    ).toBe(1);
    expect(
      buildingScore({
        buildingType: 'KHRUSHCHYOVKA',
        constructionYear: 1900,
        totalFloors: 9,
        hasElevator: false,
        seismicRetrofit: false,
      }),
    ).toBeCloseTo(0.08, 2);
  });
});
