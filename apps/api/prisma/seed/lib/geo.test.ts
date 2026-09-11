import { describe, expect, it } from 'vitest';
import {
  boundingBox,
  haversineMeters,
  pointInMultiPolygon,
  pointInPolygon,
  pointInRing,
  randomPointIn,
  type MultiPolygonCoordinates,
  type PolygonCoordinates,
} from './geo.js';
import { createRng } from './random.js';

const square: PolygonCoordinates = [
  [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ],
];

const squareWithHole: PolygonCoordinates = [
  square[0] ?? [],
  [
    [4, 4],
    [6, 4],
    [6, 6],
    [4, 6],
    [4, 4],
  ],
];

const twoSquares: MultiPolygonCoordinates = [
  square,
  [
    [
      [20, 20],
      [30, 20],
      [30, 30],
      [20, 30],
      [20, 20],
    ],
  ],
];

describe('pointInRing', () => {
  it('detects interior and exterior points', () => {
    const ring = square[0] ?? [];
    expect(pointInRing([5, 5], ring)).toBe(true);
    expect(pointInRing([15, 5], ring)).toBe(false);
    expect(pointInRing([-1, -1], ring)).toBe(false);
  });
});

describe('pointInPolygon', () => {
  it('excludes points that fall inside a hole', () => {
    expect(pointInPolygon([5, 5], squareWithHole)).toBe(false);
    expect(pointInPolygon([2, 2], squareWithHole)).toBe(true);
  });
});

describe('pointInMultiPolygon', () => {
  it('accepts a point in any member polygon', () => {
    expect(pointInMultiPolygon([25, 25], twoSquares)).toBe(true);
    expect(pointInMultiPolygon([5, 5], twoSquares)).toBe(true);
    expect(pointInMultiPolygon([15, 15], twoSquares)).toBe(false);
  });
});

describe('boundingBox', () => {
  it('spans all member polygons', () => {
    expect(boundingBox(twoSquares)).toEqual({ minLon: 0, minLat: 0, maxLon: 30, maxLat: 30 });
  });

  it('throws on empty geometry', () => {
    expect(() => boundingBox([])).toThrow(RangeError);
  });
});

describe('randomPointIn', () => {
  it('always returns a point inside the geometry', () => {
    const rng = createRng(2026);
    for (let i = 0; i < 500; i += 1) {
      const point = randomPointIn([squareWithHole], rng);
      expect(pointInPolygon(point, squareWithHole)).toBe(true);
    }
  });

  it('is deterministic for a given seed', () => {
    const first = randomPointIn(twoSquares, createRng(1));
    const second = randomPointIn(twoSquares, createRng(1));
    expect(first).toEqual(second);
  });
});

describe('haversineMeters', () => {
  it('measures Republic Square to Barekamutyun metro at roughly 2.8 km', () => {
    const republicSquare = [44.5155, 40.1776] as const;
    const barekamutyun = [44.495, 40.1969] as const;
    const distance = haversineMeters(republicSquare, barekamutyun);
    expect(distance).toBeGreaterThan(2_600);
    expect(distance).toBeLessThan(3_000);
  });

  it('is zero for identical points', () => {
    expect(haversineMeters([44.5, 40.2], [44.5, 40.2])).toBe(0);
  });
});
