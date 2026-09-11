/**
 * Narrow runtime validation for the GeoJSON files produced by
 * `scripts/fetch-osm.ts`. Keeps `JSON.parse` output typed without a schema
 * library dependency in the seed.
 */
import { readFileSync } from 'node:fs';
import type { MultiPolygonCoordinates, Position } from './geo.js';

export interface GeoFeature<G, P> {
  type: 'Feature';
  geometry: G;
  properties: P;
}

export interface FeatureCollection<G, P> {
  type: 'FeatureCollection';
  attribution: string;
  features: GeoFeature<G, P>[];
}

export interface MultiPolygonGeometry {
  type: 'MultiPolygon';
  coordinates: MultiPolygonCoordinates;
}

export interface PointGeometry {
  type: 'Point';
  coordinates: Position;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Shape after the outer check; individual features are still unvalidated. */
interface RawFeatureCollection {
  type: 'FeatureCollection';
  attribution?: unknown;
  features: unknown[];
}

function assertFeatureCollection(
  value: unknown,
  file: string,
): asserts value is RawFeatureCollection {
  if (!isRecord(value) || value.type !== 'FeatureCollection' || !Array.isArray(value.features)) {
    throw new TypeError(`${file}: expected a GeoJSON FeatureCollection`);
  }
}

function isNumberPair(value: unknown): value is Position {
  return Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === 'number');
}

function isMultiPolygonGeometry(value: unknown): value is MultiPolygonGeometry {
  if (!isRecord(value) || value.type !== 'MultiPolygon' || !Array.isArray(value.coordinates)) {
    return false;
  }
  return value.coordinates.every(
    (polygon) =>
      Array.isArray(polygon) &&
      polygon.every((ring) => Array.isArray(ring) && ring.every(isNumberPair)),
  );
}

function isPointGeometry(value: unknown): value is PointGeometry {
  return isRecord(value) && value.type === 'Point' && isNumberPair(value.coordinates);
}

export function readFeatureCollection<G, P>(
  url: URL,
  isGeometry: (value: unknown) => value is G,
  isProperties: (value: unknown) => value is P,
): FeatureCollection<G, P> {
  const file = url.pathname;
  const parsed: unknown = JSON.parse(readFileSync(url, 'utf8'));
  assertFeatureCollection(parsed, file);

  const features = parsed.features.map((feature, index): GeoFeature<G, P> => {
    if (!isRecord(feature) || feature.type !== 'Feature') {
      throw new TypeError(`${file}: feature #${String(index)} is not a Feature`);
    }
    if (!isGeometry(feature.geometry)) {
      throw new TypeError(`${file}: feature #${String(index)} has an unexpected geometry`);
    }
    if (!isProperties(feature.properties)) {
      throw new TypeError(`${file}: feature #${String(index)} has unexpected properties`);
    }
    return { type: 'Feature', geometry: feature.geometry, properties: feature.properties };
  });

  return {
    type: 'FeatureCollection',
    attribution: typeof parsed.attribution === 'string' ? parsed.attribution : '',
    features,
  };
}

export { isMultiPolygonGeometry, isPointGeometry, isRecord };
