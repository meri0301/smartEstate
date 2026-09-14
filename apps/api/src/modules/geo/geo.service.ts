import { Injectable, NotFoundException } from '@nestjs/common';
import {
  multiPolygonGeometrySchema,
  type District,
  type DistrictBoundaryResponse,
  type DistrictKind,
} from '@smartestate/contracts';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

interface DistrictRow {
  id: string;
  slug: string;
  kind: DistrictKind;
  name_hy: string;
  name_ru: string;
  name_en: string;
  city: string;
  marz: string;
  lon: number;
  lat: number;
}

interface BoundaryRow {
  slug: string;
  geojson: string;
}

/** Districts are reference data: a few rows, read often, changed only by the seed. */
@Injectable()
export class GeoService {
  constructor(private readonly prisma: PrismaService) {}

  async listDistricts(): Promise<District[]> {
    const rows = await this.prisma.$queryRaw<DistrictRow[]>`
      SELECT id, slug, kind, name_hy, name_ru, name_en, city, marz,
             ST_X(centroid) AS lon, ST_Y(centroid) AS lat
      FROM districts
      ORDER BY kind, name_en`;
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      kind: row.kind,
      name: { hy: row.name_hy, ru: row.name_ru, en: row.name_en },
      city: row.city,
      marz: row.marz,
      centroid: { lat: row.lat, lon: row.lon },
    }));
  }

  /** Boundary as GeoJSON, simplified to ~5 m so map clients receive a small payload. */
  async getBoundary(slug: string): Promise<DistrictBoundaryResponse> {
    const rows = await this.prisma.$queryRaw<BoundaryRow[]>`
      SELECT slug, ST_AsGeoJSON(ST_Multi(ST_SimplifyPreserveTopology(boundary, 0.00005)), 6)::text AS geojson
      FROM districts
      WHERE slug = ${slug}`;
    const row = rows[0];
    if (row === undefined) {
      throw new NotFoundException({ message: 'District not found', code: 'NOT_FOUND' });
    }
    const boundary = multiPolygonGeometrySchema.parse(JSON.parse(row.geojson));
    return { slug: row.slug, boundary };
  }
}
