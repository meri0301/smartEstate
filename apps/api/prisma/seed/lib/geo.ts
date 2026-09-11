/**
 * Minimal planar geometry over GeoJSON coordinate arrays. Used by the seed to
 * place buildings inside real district boundaries. PostGIS does the heavy
 * lifting in the database; these helpers only need to be correct, not fast.
 */
import type { Rng } from './random.js';

/** GeoJSON position: [longitude, latitude]. */
export type Position = readonly [lon: number, lat: number];
export type LinearRing = readonly Position[];
/** First ring is the exterior, subsequent rings are holes. */
export type PolygonCoordinates = readonly LinearRing[];
export type MultiPolygonCoordinates = readonly PolygonCoordinates[];

export interface BoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export function boundingBox(multiPolygon: MultiPolygonCoordinates): BoundingBox {
  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  for (const polygon of multiPolygon) {
    const exterior = polygon[0];
    if (exterior === undefined) {
      continue;
    }
    for (const [lon, lat] of exterior) {
      minLon = Math.min(minLon, lon);
      minLat = Math.min(minLat, lat);
      maxLon = Math.max(maxLon, lon);
      maxLat = Math.max(maxLat, lat);
    }
  }

  if (!Number.isFinite(minLon)) {
    throw new RangeError('boundingBox(): geometry has no coordinates');
  }
  return { minLon, minLat, maxLon, maxLat };
}

/** Ray-casting point-in-ring test (even–odd rule). Points on the edge are treated as inside. */
export function pointInRing(point: Position, ring: LinearRing): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (a === undefined || b === undefined) {
      continue;
    }
    const [xi, yi] = a;
    const [xj, yj] = b;
    const crossesRay = yi > y !== yj > y;
    if (crossesRay) {
      const xAtY = ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (x < xAtY) {
        inside = !inside;
      }
    }
  }
  return inside;
}

export function pointInPolygon(point: Position, polygon: PolygonCoordinates): boolean {
  const [exterior, ...holes] = polygon;
  if (exterior === undefined || !pointInRing(point, exterior)) {
    return false;
  }
  return !holes.some((hole) => pointInRing(point, hole));
}

export function pointInMultiPolygon(
  point: Position,
  multiPolygon: MultiPolygonCoordinates,
): boolean {
  return multiPolygon.some((polygon) => pointInPolygon(point, polygon));
}

/**
 * Uniform random point inside the geometry by rejection sampling over its
 * bounding box. District shapes are compact, so acceptance is high.
 */
export function randomPointIn(
  multiPolygon: MultiPolygonCoordinates,
  rng: Rng,
  maxAttempts = 10_000,
): Position {
  const box = boundingBox(multiPolygon);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate: Position = [
      rng.float(box.minLon, box.maxLon),
      rng.float(box.minLat, box.maxLat),
    ];
    if (pointInMultiPolygon(candidate, multiPolygon)) {
      return candidate;
    }
  }
  throw new RangeError(
    `randomPointIn(): no interior point found after ${String(maxAttempts)} attempts`,
  );
}

const EARTH_RADIUS_METERS = 6_371_008.8;

/** Great-circle distance between two WGS84 positions. */
export function haversineMeters(a: Position, b: Position): number {
  const toRad = (degrees: number): number => (degrees * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}
