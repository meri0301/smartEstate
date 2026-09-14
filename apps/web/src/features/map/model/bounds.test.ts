import { describe, expect, it } from 'vitest';
import { boundsOf, groupByPosition, padBounds, toBboxParam, type GeoPoint } from './bounds.js';

const point = (lat: number, lon: number): GeoPoint => ({ lat, lon });

describe('boundsOf', () => {
  it('has nothing to fit for an empty list', () => {
    expect(boundsOf([])).toBeUndefined();
  });

  it('returns a zero-area box for a single point', () => {
    expect(boundsOf([point(40.18, 44.51)])).toEqual([44.51, 40.18, 44.51, 40.18]);
  });

  it('spans every point, west and south first', () => {
    expect(boundsOf([point(40.18, 44.51), point(40.1, 44.6), point(40.25, 44.45)])).toEqual([
      44.45, 40.1, 44.6, 40.25,
    ]);
  });

  it('skips points with non-finite coordinates', () => {
    expect(boundsOf([point(Number.NaN, 44.5), point(40.18, 44.51)])).toEqual([
      44.51, 40.18, 44.51, 40.18,
    ]);
    expect(boundsOf([point(Number.NaN, Number.NaN)])).toBeUndefined();
  });
});

describe('padBounds', () => {
  it('grows the box on all four sides', () => {
    expect(padBounds([44.5, 40.1, 44.6, 40.2], 0.01)).toEqual([44.49, 40.09, 44.61, 40.21]);
  });

  it('gives a single point an extent', () => {
    const padded = padBounds([44.51, 40.18, 44.51, 40.18], 0.005);
    expect(padded[2] - padded[0]).toBeCloseTo(0.01, 6);
  });
});

describe('toBboxParam', () => {
  it('writes the four numbers the API expects', () => {
    expect(toBboxParam([44.5, 40.1, 44.6, 40.2])).toBe('44.50000,40.10000,44.60000,40.20000');
  });
});

describe('groupByPosition', () => {
  it('collects listings that share a building into one marker', () => {
    const groups = groupByPosition([
      { id: 'a', lat: 40.18, lon: 44.51 },
      { id: 'b', lat: 40.18, lon: 44.51 },
      { id: 'c', lat: 40.19, lon: 44.52 },
    ]);
    expect(groups.size).toBe(2);
    expect(groups.get('44.510000,40.180000')?.map((item) => item.id)).toEqual(['a', 'b']);
  });
});
