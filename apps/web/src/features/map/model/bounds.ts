/**
 * Geometry helpers for the map, kept apart from the renderer so they can be
 * tested without WebGL.
 */

export interface GeoPoint {
  lat: number;
  lon: number;
}

/** West, south, east, north — the order MapLibre and the API both use. */
export type BoundingBox = [west: number, south: number, east: number, north: number];

/**
 * The smallest box containing every point, or `undefined` when there is nothing
 * to fit. A single point yields a zero-area box, which callers pad.
 */
export function boundsOf(points: readonly GeoPoint[]): BoundingBox | undefined {
  if (points.length === 0) {
    return undefined;
  }
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const { lat, lon } of points) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return Number.isFinite(west) ? [west, south, east, north] : undefined;
}

/**
 * Grows a box by a margin in degrees, so a fitted view does not put markers
 * against the edge and a single point still has an extent to zoom to.
 */
export function padBounds(bounds: BoundingBox, margin: number): BoundingBox {
  const [west, south, east, north] = bounds;
  return [west - margin, south - margin, east + margin, north + margin];
}

/** The `bbox` query parameter: four numbers, minimums first, at a sane precision. */
export function toBboxParam(bounds: BoundingBox, precision = 5): string {
  return bounds.map((value) => value.toFixed(precision)).join(',');
}

/**
 * Distinguishes markers that would land on the same pixel. Listings in one
 * building share their coordinates exactly, because the location is copied from
 * the building, so without this they would stack invisibly.
 */
export function groupByPosition<T extends GeoPoint>(items: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = `${item.lon.toFixed(6)},${item.lat.toFixed(6)}`;
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, [item]);
    } else {
      existing.push(item);
    }
  }
  return groups;
}
