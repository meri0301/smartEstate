/**
 * Basemap configuration.
 *
 * MapLibre is the renderer and OpenStreetMap supplies the tiles, so the map has
 * no proprietary dependency and no access token — which matters for a project
 * that has to run from `docker compose up` on any machine. Raster tiles rather
 * than vector: a vector basemap needs a style server or a large sprite and glyph
 * bundle, and the map here is a locator, not a cartography exercise.
 *
 * OpenStreetMap's tile service is donated infrastructure. Its usage policy asks
 * for attribution, which is displayed, and forbids bulk downloading, which a
 * browsing interface does not do. `VITE_MAP_TILE_URL` points the map at another
 * provider without a code change.
 */
import type { StyleSpecification } from 'maplibre-gl';

export const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Required by the tile provider and rendered in the map's own attribution control. */
export const OSM_ATTRIBUTION =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>';

/** Republic Square: the centre the map opens on when there is nothing to fit. */
export const YEREVAN_CENTRE: [number, number] = [44.5126, 40.1776];

export const DEFAULT_ZOOM = 12;

/** Past this the tile provider has no imagery for Armenia, and the map would show blank squares. */
export const MAX_ZOOM = 18;

export function tileUrl(): string {
  const configured: unknown = import.meta.env.VITE_MAP_TILE_URL;
  return typeof configured === 'string' && configured.length > 0 ? configured : DEFAULT_TILE_URL;
}

/**
 * Minimal raster style. Built as a function rather than a constant because
 * MapLibre mutates the style object it is handed.
 */
export function basemapStyle(url: string = tileUrl()): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: [url],
        tileSize: 256,
        maxzoom: MAX_ZOOM,
        attribution: OSM_ATTRIBUTION,
      },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
  };
}
