import { z } from 'zod';
import { districtKindSchema } from './common/enums.js';
import { geoPointSchema, localizedNameSchema, uuidSchema } from './common/primitives.js';

export const districtSlugSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,40}$/, 'Invalid district slug');

export const districtSchema = z.object({
  id: uuidSchema,
  slug: districtSlugSchema,
  kind: districtKindSchema,
  name: localizedNameSchema,
  city: z.string(),
  marz: z.string(),
  centroid: geoPointSchema,
});
export type District = z.infer<typeof districtSchema>;

export const districtsResponseSchema = z.array(districtSchema);

/** GeoJSON position [lon, lat]. */
const positionSchema = z.tuple([z.number(), z.number()]);
const linearRingSchema = z.array(positionSchema).min(4);
const polygonSchema = z.array(linearRingSchema).min(1);

export const multiPolygonGeometrySchema = z.object({
  type: z.literal('MultiPolygon'),
  coordinates: z.array(polygonSchema).min(1),
});
export type MultiPolygonGeometry = z.infer<typeof multiPolygonGeometrySchema>;

export const districtBoundaryResponseSchema = z.object({
  slug: districtSlugSchema,
  boundary: multiPolygonGeometrySchema,
});
export type DistrictBoundaryResponse = z.infer<typeof districtBoundaryResponseSchema>;
