import { z } from 'zod';
import {
  buildingTypeSchema,
  conditionSchema,
  currencySchema,
  heatingTypeSchema,
  listingStatusSchema,
  localeSchema,
  mediaKindSchema,
  ownershipDocsStatusSchema,
} from './common/enums.js';
import { pageSchema, paginationQuerySchema } from './common/pagination.js';
import {
  amdAmountSchema,
  geoPointSchema,
  isoDateTimeSchema,
  localizedNameSchema,
  publicIdSchema,
  uuidSchema,
} from './common/primitives.js';
import { csvList, queryBooleanSchema, queryIntSchema, queryNumberSchema } from './common/query.js';
import { districtSlugSchema } from './geo.js';

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getUTCFullYear();

export const buildingSchema = z.object({
  id: uuidSchema,
  districtId: uuidSchema,
  addressLine: z.string(),
  street: localizedNameSchema,
  houseNumber: z.string(),
  buildingType: buildingTypeSchema,
  constructionYear: z.number().int(),
  totalFloors: z.number().int(),
  hasElevator: z.boolean(),
  seismicRetrofit: z.boolean(),
  location: geoPointSchema,
});
export type Building = z.infer<typeof buildingSchema>;

export const createBuildingBodySchema = z.object({
  street: z.object({
    hy: z.string().trim().min(1).max(120),
    ru: z.string().trim().min(1).max(120),
    en: z.string().trim().min(1).max(120),
  }),
  houseNumber: z.string().trim().min(1).max(20),
  buildingType: buildingTypeSchema,
  constructionYear: z
    .number()
    .int()
    .min(1850)
    .max(CURRENT_YEAR + 3),
  totalFloors: z.number().int().min(1).max(60),
  hasElevator: z.boolean(),
  seismicRetrofit: z.boolean().default(false),
  /** The district is resolved server-side from this point. */
  location: geoPointSchema,
});
export type CreateBuildingBody = z.infer<typeof createBuildingBodySchema>;

// ---------------------------------------------------------------------------
// Listing content and attributes
// ---------------------------------------------------------------------------

export const listingTranslationInputSchema = z.object({
  locale: localeSchema,
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(5000),
});
export type ListingTranslationInput = z.infer<typeof listingTranslationInputSchema>;

export const listingTranslationSchema = listingTranslationInputSchema.extend({
  isMachineTranslated: z.boolean(),
});
export type ListingTranslation = z.infer<typeof listingTranslationSchema>;

const translationsInputSchema = z
  .array(listingTranslationInputSchema)
  .min(1)
  .max(3)
  .refine((items) => new Set(items.map((t) => t.locale)).size === items.length, {
    message: 'Each locale may appear only once',
  });

/** Attributes a trader supplies; derived fields (price per m², location) are computed. */
const listingAttributeFields = {
  priceAmd: amdAmountSchema.min(1),
  priceNegotiable: z.boolean(),
  originalCurrency: currencySchema,
  originalPrice: z.number().positive().nullable(),
  totalArea: z.number().min(10).max(1000),
  livingArea: z.number().min(5).max(1000).nullable(),
  kitchenArea: z.number().min(2).max(200).nullable(),
  rooms: z.number().int().min(1).max(10),
  bathrooms: z.number().int().min(1).max(5),
  ceilingHeight: z.number().min(2).max(5).nullable(),
  floor: z.number().int().min(1).max(60),
  balconyCount: z.number().int().min(0).max(5),
  hasLoggia: z.boolean(),
  hasParking: z.boolean(),
  hasStorage: z.boolean(),
  condition: conditionSchema,
  heating: heatingTypeSchema,
  ownershipDocs: ownershipDocsStatusSchema,
};

export const listingAttributesSchema = z.object(listingAttributeFields);
export type ListingAttributes = z.infer<typeof listingAttributesSchema>;

/** Creation applies sensible defaults; updates (below) never do, so a partial body changes only what it names. */
export const createListingBodySchema = z.object({
  ...listingAttributeFields,
  priceNegotiable: listingAttributeFields.priceNegotiable.default(false),
  originalCurrency: listingAttributeFields.originalCurrency.default('AMD'),
  originalPrice: listingAttributeFields.originalPrice.default(null),
  livingArea: listingAttributeFields.livingArea.default(null),
  kitchenArea: listingAttributeFields.kitchenArea.default(null),
  bathrooms: listingAttributeFields.bathrooms.default(1),
  ceilingHeight: listingAttributeFields.ceilingHeight.default(null),
  balconyCount: listingAttributeFields.balconyCount.default(0),
  hasLoggia: listingAttributeFields.hasLoggia.default(false),
  hasParking: listingAttributeFields.hasParking.default(false),
  hasStorage: listingAttributeFields.hasStorage.default(false),
  ownershipDocs: listingAttributeFields.ownershipDocs.default('UNVERIFIED'),
  buildingId: uuidSchema,
  translations: translationsInputSchema,
});
export type CreateListingBody = z.infer<typeof createListingBodySchema>;
/** What a form submits: defaulted fields are optional. */
export type CreateListingBodyInput = z.input<typeof createListingBodySchema>;

/**
 * Attribute edits only. `status` is deliberately absent: the moderation
 * lifecycle is driven by `POST /listings/:id/transitions`, and letting a PATCH
 * assign a status would be a way around the transition table.
 */
export const updateListingBodySchema = listingAttributesSchema
  .partial()
  .extend({
    translations: translationsInputSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateListingBody = z.infer<typeof updateListingBodySchema>;

// ---------------------------------------------------------------------------
// Moderation lifecycle
// ---------------------------------------------------------------------------

/**
 * Transitions a caller may request. Whether one is legal depends on two
 * independent checks: the listing's current status, against the transition
 * table, and who is asking, against the listing policy.
 */
export const LISTING_TRANSITIONS = [
  'SUBMIT',
  'PUBLISH',
  'APPROVE',
  'REJECT',
  'REVISE',
  'ARCHIVE',
] as const;
export const listingTransitionSchema = z.enum(LISTING_TRANSITIONS);
export type ListingTransition = z.infer<typeof listingTransitionSchema>;

/** A rejection must say why; the reason is stored and shown back to the owner. */
export const listingTransitionBodySchema = z
  .object({
    action: listingTransitionSchema,
    reason: z.string().trim().min(10).max(1000).optional(),
  })
  .refine((body) => body.action !== 'REJECT' || body.reason !== undefined, {
    message: 'A rejection requires a reason',
    path: ['reason'],
  });
export type ListingTransitionBody = z.infer<typeof listingTransitionBodySchema>;

/**
 * Where a photograph lives.
 *
 * Either an absolute URL, for imagery hosted somewhere else, or a root-relative
 * path for imagery the application serves itself — which is what the seeded
 * catalogue uses, so that a demonstration needs no internet and no remote
 * placeholder service decides what a listing looks like.
 *
 * The path form is deliberately narrow. It must start with a single slash, so
 * it cannot be read as a protocol-relative URL to another host, and it excludes
 * the characters that would let one be smuggled in.
 *
 * One string with one pattern rather than a union of `z.url()` and a path.
 * A union here reaches the OpenAPI bridge as a composite the decorator reader
 * cannot name, and Nest reports it as a circular dependency on `thumbnailUrl`
 * and refuses to start the application.
 */
export const mediaUrlSchema = z
  .string()
  .regex(
    /^(?:https?:\/\/[^\s]+|\/[A-Za-z0-9\-_./]+)$/,
    'Must be an absolute http(s) URL or an app-served path',
  );

export const mediaSchema = z.object({
  id: uuidSchema,
  kind: mediaKindSchema,
  url: mediaUrlSchema,
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  sortOrder: z.number().int(),
  isPlaceholder: z.boolean(),
});
export type Media = z.infer<typeof mediaSchema>;

export const priceHistoryEntrySchema = z.object({
  priceAmd: amdAmountSchema,
  recordedAt: isoDateTimeSchema,
});

// ---------------------------------------------------------------------------
// Listing representations
// ---------------------------------------------------------------------------

export const listingSummarySchema = z.object({
  id: uuidSchema,
  publicId: publicIdSchema,
  status: listingStatusSchema,
  /** Locale actually used for `title`; may differ from the requested one when a fallback applied. */
  locale: localeSchema,
  title: z.string(),
  priceAmd: amdAmountSchema,
  pricePerSqmAmd: amdAmountSchema,
  originalCurrency: currencySchema,
  originalPrice: z.number().nullable(),
  priceNegotiable: z.boolean(),
  rooms: z.number().int(),
  totalArea: z.number(),
  floor: z.number().int(),
  totalFloors: z.number().int(),
  buildingType: buildingTypeSchema,
  condition: conditionSchema,
  district: z.object({ slug: districtSlugSchema, name: localizedNameSchema }),
  location: geoPointSchema,
  thumbnailUrl: mediaUrlSchema.nullable(),
  publishedAt: isoDateTimeSchema,
});
export type ListingSummary = z.infer<typeof listingSummarySchema>;

export const listingDetailSchema = listingSummarySchema.extend({
  description: z.string(),
  livingArea: z.number().nullable(),
  kitchenArea: z.number().nullable(),
  bathrooms: z.number().int(),
  ceilingHeight: z.number().nullable(),
  balconyCount: z.number().int(),
  hasLoggia: z.boolean(),
  hasParking: z.boolean(),
  hasStorage: z.boolean(),
  heating: heatingTypeSchema,
  ownershipDocs: ownershipDocsStatusSchema,
  building: buildingSchema,
  media: z.array(mediaSchema),
  translations: z.array(listingTranslationSchema),
  priceHistory: z.array(priceHistoryEntrySchema),
  createdById: uuidSchema.nullable(),
  /** Why a moderator sent the listing back; present only while the status is REJECTED. */
  rejectionReason: z.string().nullable(),
  /** When a moderator last approved or rejected it. */
  reviewedAt: isoDateTimeSchema.nullable(),
  /** When the owner last sent it for review. */
  submittedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type ListingDetail = z.infer<typeof listingDetailSchema>;

export const listingsPageSchema = pageSchema(listingSummarySchema);
export type ListingsPage = z.infer<typeof listingsPageSchema>;

// ---------------------------------------------------------------------------
// Structured search
// ---------------------------------------------------------------------------

export const LISTING_SORTS = [
  'published_desc',
  'price_asc',
  'price_desc',
  'price_per_sqm_asc',
  'price_per_sqm_desc',
  'area_asc',
  'area_desc',
] as const;
export const listingSortSchema = z.enum(LISTING_SORTS);
export type ListingSort = z.infer<typeof listingSortSchema>;

/** "minLon,minLat,maxLon,maxLat" */
const bboxSchema = z.string().transform((value, ctx) => {
  const parts = value.split(',').map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    ctx.addIssue({ code: 'custom', message: 'bbox must be "minLon,minLat,maxLon,maxLat"' });
    return z.NEVER;
  }
  const [minLon, minLat, maxLon, maxLat] = parts as [number, number, number, number];
  if (minLon >= maxLon || minLat >= maxLat) {
    ctx.addIssue({ code: 'custom', message: 'bbox minimum must be smaller than maximum' });
    return z.NEVER;
  }
  return { minLon, minLat, maxLon, maxLat };
});

export const listingSearchQuerySchema = paginationQuerySchema
  .extend({
    locale: localeSchema.optional(),
    sort: listingSortSchema.default('published_desc'),
    status: listingStatusSchema.default('PUBLISHED'),
    /**
     * Restrict the result to the caller's own listings. Only with this flag may
     * a non-moderator ask for a status other than PUBLISHED; the API narrows the
     * filter otherwise, so nobody can enumerate someone else's drafts.
     */
    mine: queryBooleanSchema.default(false),

    priceMin: queryIntSchema.min(0).optional(),
    priceMax: queryIntSchema.min(0).optional(),
    pricePerSqmMax: queryIntSchema.min(0).optional(),
    roomsMin: queryIntSchema.min(1).max(10).optional(),
    roomsMax: queryIntSchema.min(1).max(10).optional(),
    areaMin: queryNumberSchema.min(0).optional(),
    areaMax: queryNumberSchema.min(0).optional(),
    floorMin: queryIntSchema.min(1).optional(),
    floorMax: queryIntSchema.min(1).optional(),
    ceilingMin: queryNumberSchema.min(2).max(5).optional(),
    yearMin: queryIntSchema.min(1850).optional(),
    yearMax: queryIntSchema.min(1850).optional(),

    districts: csvList(districtSlugSchema).optional(),
    buildingTypes: csvList(buildingTypeSchema, { max: 6 }).optional(),
    conditions: csvList(conditionSchema, { max: 5 }).optional(),
    heating: csvList(heatingTypeSchema, { max: 4 }).optional(),

    excludeGroundFloor: queryBooleanSchema.optional(),
    excludeTopFloor: queryBooleanSchema.optional(),
    hasElevator: queryBooleanSchema.optional(),
    hasParking: queryBooleanSchema.optional(),
    hasBalcony: queryBooleanSchema.optional(),
    hasStorage: queryBooleanSchema.optional(),
    seismicRetrofit: queryBooleanSchema.optional(),
    docsVerified: queryBooleanSchema.optional(),
    priceNegotiable: queryBooleanSchema.optional(),

    /** Radius search: all three of nearLat, nearLon and radiusM are required together. */
    nearLat: queryNumberSchema.min(-90).max(90).optional(),
    nearLon: queryNumberSchema.min(-180).max(180).optional(),
    radiusM: queryIntSchema.min(100).max(20_000).optional(),
    bbox: bboxSchema.optional(),
  })
  .superRefine((query, ctx) => {
    const pairs: [keyof typeof query, keyof typeof query][] = [
      ['priceMin', 'priceMax'],
      ['roomsMin', 'roomsMax'],
      ['areaMin', 'areaMax'],
      ['floorMin', 'floorMax'],
      ['yearMin', 'yearMax'],
    ];
    for (const [minKey, maxKey] of pairs) {
      const min = query[minKey];
      const max = query[maxKey];
      if (typeof min === 'number' && typeof max === 'number' && min > max) {
        ctx.addIssue({ code: 'custom', path: [maxKey], message: `${maxKey} must be >= ${minKey}` });
      }
    }
    const nearParts = [query.nearLat, query.nearLon, query.radiusM].filter((v) => v !== undefined);
    if (nearParts.length > 0 && nearParts.length < 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['radiusM'],
        message: 'nearLat, nearLon and radiusM must be provided together',
      });
    }
  });
export type ListingSearchQuery = z.infer<typeof listingSearchQuerySchema>;
export type ListingSearchQueryInput = z.input<typeof listingSearchQuerySchema>;
