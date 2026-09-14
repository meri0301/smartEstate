import { z } from 'zod';

export const uuidSchema = z.uuid();

/** Short public listing identifier, e.g. "L-7F3K9Q". */
export const publicIdSchema = z.string().regex(/^L-[A-HJ-NP-Z2-9]{6}$/, 'Invalid public id');

export const geoPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});
export type GeoPoint = z.infer<typeof geoPointSchema>;

/** Canonical amounts in Armenian dram. Safe-integer bound keeps JSON round-trips exact. */
export const amdAmountSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

export const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const localizedNameSchema = z.object({
  hy: z.string(),
  ru: z.string(),
  en: z.string(),
});
export type LocalizedName = z.infer<typeof localizedNameSchema>;
