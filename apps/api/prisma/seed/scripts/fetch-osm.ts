/**
 * One-time data preparation: downloads Yerevan district boundaries and points of
 * interest from OpenStreetMap and writes them as GeoJSON into `../data`.
 *
 * The output is committed so that `prisma db seed` never touches the network —
 * a requirement for the offline defence demo and for reproducible seeds.
 *
 * Run from apps/api:   pnpm osm:fetch            (completes whatever is missing)
 *                      pnpm osm:fetch -- --force (refetch everything)
 *
 * Overpass instances are frequently overloaded or unreachable, so the POI file
 * records which categories it contains and every category is cached in
 * `../data/.osm-cache` as soon as it arrives; rerunning resumes where it stopped.
 *
 * Data © OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright
 * Nominatim usage policy: ≤ 1 request/second, identifying User-Agent.
 * Overpass usage policy: sequential requests, modest volume.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const USER_AGENT = 'smartestate-thesis-seed/0.1 (https://github.com/meri0301/smartEstate)';
const NOMINATIM = 'https://nominatim.openstreetmap.org';
/** Public Overpass instances, tried in order when one is overloaded. */
const OVERPASS_ENDPOINTS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const YEREVAN_BBOX = '(40.08,44.36,40.27,44.62)';
const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
const CACHE_DIR = path.join(OUT_DIR, '.osm-cache');
const DISTRICTS_FILE = path.join(OUT_DIR, 'districts.geojson');
const POIS_FILE = path.join(OUT_DIR, 'pois.geojson');
const ATTRIBUTION =
  '© OpenStreetMap contributors, ODbL 1.0 — https://www.openstreetmap.org/copyright';

/** Yerevan administrative districts — OSM relation ids at admin_level=5. */
const YEREVAN_DISTRICTS: readonly { slug: string; osmRelationId: number }[] = [
  { slug: 'kentron', osmRelationId: 13404218 },
  { slug: 'arabkir', osmRelationId: 13404297 },
  { slug: 'ajapnyak', osmRelationId: 13404299 },
  { slug: 'avan', osmRelationId: 13404250 },
  { slug: 'davtashen', osmRelationId: 13404298 },
  { slug: 'erebuni', osmRelationId: 13404216 },
  { slug: 'kanaker-zeytun', osmRelationId: 13404296 },
  { slug: 'malatia-sebastia', osmRelationId: 13404219 },
  { slug: 'nor-nork', osmRelationId: 13404220 },
  { slug: 'nork-marash', osmRelationId: 13404217 },
  { slug: 'nubarashen', osmRelationId: 13404214 },
  { slug: 'shengavit', osmRelationId: 13404215 },
];

/** Towns outside Yerevan with marz-level support. Resolved by name search. */
const TOWNS: readonly { slug: string; query: string }[] = [
  { slug: 'gyumri', query: 'Gyumri, Shirak, Armenia' },
  { slug: 'vanadzor', query: 'Vanadzor, Lori, Armenia' },
  { slug: 'dilijan', query: 'Dilijan, Tavush, Armenia' },
];

const POI_QUERIES: readonly { category: string; selector: string }[] = [
  { category: 'METRO', selector: 'node["railway"="station"]["station"="subway"]' },
  { category: 'SCHOOL', selector: 'nwr["amenity"="school"]' },
  { category: 'KINDERGARTEN', selector: 'nwr["amenity"="kindergarten"]' },
  { category: 'HOSPITAL', selector: 'nwr["amenity"~"^(hospital|clinic)$"]' },
  { category: 'PARK', selector: 'nwr["leisure"="park"]' },
  { category: 'SUPERMARKET', selector: 'nwr["shop"="supermarket"]' },
];

interface NominatimPlace {
  osm_type: string;
  osm_id: number;
  class: string;
  type: string;
  name?: string;
  display_name: string;
  lat: string;
  lon: string;
  geojson?: GeoJsonGeometry;
  namedetails?: Record<string, string>;
}

interface GeoJsonGeometry {
  type: string;
  coordinates: unknown;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface Feature {
  type: 'Feature';
  geometry: GeoJsonGeometry;
  properties: Record<string, unknown>;
}

interface PoiCollection {
  type: 'FeatureCollection';
  attribution: string;
  fetchedAt: string;
  categories: string[];
  features: Feature[];
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson<T>(url: string, init?: RequestInit, attempts = 4): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const headers = new Headers(init?.headers);
    headers.set('user-agent', USER_AGENT);
    try {
      const response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(120_000) });
      const text = await response.text();
      const trimmed = text.trimStart();
      if (response.ok && (trimmed.startsWith('{') || trimmed.startsWith('['))) {
        return JSON.parse(text) as T;
      }
      console.warn(
        `attempt ${String(attempt)} failed (${String(response.status)}): ${text.slice(0, 100).replaceAll(/\s+/g, ' ')}`,
      );
    } catch (error) {
      console.warn(
        `attempt ${String(attempt)} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (attempt < attempts) {
      const wait = 10_000 * attempt;
      console.warn(`retrying in ${String(wait / 1000)}s`);
      await sleep(wait);
    }
  }
  throw new Error(`Request failed after ${String(attempts)} attempts: ${url}`);
}

async function fetchOverpass(query: string): Promise<{ elements: OverpassElement[] }> {
  let lastError: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      return await fetchJson<{ elements: OverpassElement[] }>(
        endpoint,
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
        },
        2,
      );
    } catch (error) {
      lastError = error;
      console.warn(`${endpoint} unavailable, trying next mirror`);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('All Overpass mirrors failed');
}

function toMultiPolygon(geometry: GeoJsonGeometry): GeoJsonGeometry {
  if (geometry.type === 'MultiPolygon') {
    return geometry;
  }
  if (geometry.type === 'Polygon') {
    return { type: 'MultiPolygon', coordinates: [geometry.coordinates] };
  }
  throw new Error(`Expected (Multi)Polygon, received ${geometry.type}`);
}

function pickName(details: Record<string, string> | undefined, key: string): string | null {
  return details?.[key] ?? null;
}

async function fetchDistricts(): Promise<Feature[]> {
  const ids = YEREVAN_DISTRICTS.map((d) => `R${String(d.osmRelationId)}`).join(',');
  const places = await fetchJson<NominatimPlace[]>(
    `${NOMINATIM}/lookup?osm_ids=${ids}&format=jsonv2&polygon_geojson=1&namedetails=1`,
  );
  const bySlug = new Map(YEREVAN_DISTRICTS.map((d) => [d.osmRelationId, d.slug]));
  const features: Feature[] = [];

  for (const place of places) {
    const slug = bySlug.get(place.osm_id);
    if (!slug || !place.geojson) {
      throw new Error(`Unexpected lookup result for relation ${String(place.osm_id)}`);
    }
    features.push({
      type: 'Feature',
      geometry: toMultiPolygon(place.geojson),
      properties: {
        slug,
        kind: 'CITY_DISTRICT',
        city: 'Yerevan',
        marz: 'Yerevan',
        osmType: place.osm_type,
        osmId: place.osm_id,
        nameHy: pickName(place.namedetails, 'name:hy') ?? pickName(place.namedetails, 'name'),
        nameRu: pickName(place.namedetails, 'name:ru'),
        nameEn: pickName(place.namedetails, 'name:en'),
      },
    });
    console.warn(`district ${slug}: ${place.geojson.type}`);
  }

  for (const town of TOWNS) {
    await sleep(1_100);
    const results = await fetchJson<NominatimPlace[]>(
      `${NOMINATIM}/search?q=${encodeURIComponent(town.query)}&format=jsonv2&polygon_geojson=1&namedetails=1&limit=5`,
    );
    // Town limits are usually a boundary relation, but a small town such as
    // Dilijan is mapped as a single closed way; both yield a polygon.
    const place = results.find(
      (r) =>
        (r.osm_type === 'relation' || r.osm_type === 'way') &&
        r.geojson !== undefined &&
        (r.geojson.type === 'Polygon' || r.geojson.type === 'MultiPolygon'),
    );
    if (!place?.geojson) {
      throw new Error(`No polygon result for ${town.query}`);
    }
    const marz = place.display_name.split(',').map((s) => s.trim())[1] ?? null;
    features.push({
      type: 'Feature',
      geometry: toMultiPolygon(place.geojson),
      properties: {
        slug: town.slug,
        kind: 'TOWN',
        city: pickName(place.namedetails, 'name:en') ?? place.name ?? town.slug,
        marz,
        osmType: place.osm_type,
        osmId: place.osm_id,
        nameHy: pickName(place.namedetails, 'name:hy') ?? pickName(place.namedetails, 'name'),
        nameRu: pickName(place.namedetails, 'name:ru'),
        nameEn: pickName(place.namedetails, 'name:en'),
      },
    });
    console.warn(`town ${town.slug}: ${place.geojson.type} (${place.display_name})`);
  }

  return features;
}

function toPoiFeatures(category: string, elements: readonly OverpassElement[]): Feature[] {
  const features: Feature[] = [];
  for (const element of elements) {
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    if (lat === undefined || lon === undefined) {
      continue;
    }
    const tags = element.tags ?? {};
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {
        category,
        osmType: element.type,
        osmId: element.id,
        nameHy: tags['name:hy'] ?? tags.name ?? null,
        nameRu: tags['name:ru'] ?? null,
        nameEn: tags['name:en'] ?? null,
      },
    });
  }
  return features;
}

/** Fetches one category, using the on-disk cache when present. */
async function fetchPoiCategory(
  category: string,
  selector: string,
  force: boolean,
): Promise<Feature[]> {
  const cacheFile = path.join(CACHE_DIR, `${category.toLowerCase()}.json`);
  if (!force && existsSync(cacheFile)) {
    const cached = JSON.parse(await readFile(cacheFile, 'utf8')) as Feature[];
    console.warn(`poi ${category}: ${String(cached.length)} (cached)`);
    return cached;
  }
  await sleep(5_000);
  const query = `[out:json][timeout:90];${selector}${YEREVAN_BBOX};out center tags;`;
  const result = await fetchOverpass(query);
  const features = toPoiFeatures(category, result.elements);
  await writeFile(cacheFile, JSON.stringify(features), 'utf8');
  console.warn(`poi ${category}: ${String(features.length)}`);
  return features;
}

async function readExistingPois(): Promise<PoiCollection | null> {
  if (!existsSync(POIS_FILE)) {
    return null;
  }
  const parsed = JSON.parse(await readFile(POIS_FILE, 'utf8')) as Partial<PoiCollection>;
  return {
    type: 'FeatureCollection',
    attribution: parsed.attribution ?? ATTRIBUTION,
    fetchedAt: parsed.fetchedAt ?? new Date(0).toISOString(),
    categories: parsed.categories ?? [],
    features: parsed.features ?? [],
  };
}

/**
 * Completes the POI file category by category. Categories already present are
 * kept unless --force is given, so a partial file from an earlier, interrupted
 * run is finished rather than discarded.
 */
async function fetchPois(force: boolean): Promise<{ collection: PoiCollection; changed: boolean }> {
  await mkdir(CACHE_DIR, { recursive: true });
  const existing = force ? null : await readExistingPois();
  const present = new Set(existing?.categories ?? []);
  const features = existing?.features ?? [];
  let changed = existing === null;

  for (const { category, selector } of POI_QUERIES) {
    if (present.has(category)) {
      console.warn(`poi ${category}: already present, skipping`);
      continue;
    }
    try {
      features.push(...(await fetchPoiCategory(category, selector, force)));
      present.add(category);
      changed = true;
    } catch (error) {
      console.warn(
        `poi ${category}: unavailable (${error instanceof Error ? error.message : String(error)}); rerun later`,
      );
    }
  }

  return {
    changed,
    collection: {
      type: 'FeatureCollection',
      attribution: ATTRIBUTION,
      fetchedAt: new Date().toISOString(),
      categories: POI_QUERIES.map((q) => q.category).filter((c) => present.has(c)),
      features,
    },
  };
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await writeFile(file, `${JSON.stringify(value)}\n`, 'utf8');
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const force = process.argv.includes('--force');

  if (force || !existsSync(DISTRICTS_FILE)) {
    const districts = await fetchDistricts();
    await writeJson(DISTRICTS_FILE, {
      type: 'FeatureCollection',
      attribution: ATTRIBUTION,
      fetchedAt: new Date().toISOString(),
      features: districts,
    });
    console.warn(`districts: ${String(districts.length)} written`);
  } else {
    console.warn('districts: already present, skipping (use --force to refetch)');
  }

  const { collection, changed } = await fetchPois(force);
  if (changed) {
    await writeJson(POIS_FILE, collection);
  }
  const missing = POI_QUERIES.map((q) => q.category).filter(
    (c) => !collection.categories.includes(c),
  );
  console.warn(
    `pois: ${String(collection.features.length)} features, categories [${collection.categories.join(', ')}]` +
      (missing.length > 0
        ? `; missing [${missing.join(', ')}] — rerun when Overpass is reachable`
        : ''),
  );
  if (missing.length > 0) {
    process.exitCode = 2;
  }
}

await main();
