import { z } from 'zod';
import { displayNameSchema, userSchema } from './auth.js';
import { localeSchema, roleSchema } from './common/enums.js';
import { paginationQuerySchema } from './common/pagination.js';
import { amdAmountSchema, geoPointSchema, isoDateTimeSchema } from './common/primitives.js';

/** Armenian numbers are +374 followed by 8 digits; accept international E.164 generally. */
export const phoneSchema = z.string().regex(/^\+?[1-9][0-9]{7,14}$/, 'Invalid phone number');

export const updateMeBodySchema = z
  .object({
    displayName: displayNameSchema.optional(),
    phone: phoneSchema.nullable().optional(),
    locale: localeSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one field must be provided',
  });
export type UpdateMeBody = z.infer<typeof updateMeBodySchema>;

export const commuteAnchorSchema = geoPointSchema.extend({
  label: z.string().trim().min(1).max(120),
});
export type CommuteAnchor = z.infer<typeof commuteAnchorSchema>;

/** Criterion weights for the recommender; keys are criterion ids, values sum is normalised server-side. */
export const prioritiesSchema = z.record(z.string().min(1).max(40), z.number().min(0).max(1));

export const preferencesBodySchema = z
  .object({
    budgetMinAmd: amdAmountSchema.nullable(),
    budgetMaxAmd: amdAmountSchema.nullable(),
    preferredRooms: z.array(z.number().int().min(1).max(10)).max(10),
    priorities: prioritiesSchema,
    commuteAnchor: commuteAnchorSchema.nullable(),
  })
  .refine(
    (body) =>
      body.budgetMinAmd === null ||
      body.budgetMaxAmd === null ||
      body.budgetMinAmd <= body.budgetMaxAmd,
    { message: 'budgetMinAmd must not exceed budgetMaxAmd', path: ['budgetMaxAmd'] },
  );
export type PreferencesBody = z.infer<typeof preferencesBodySchema>;

export const profileSchema = z.object({
  displayName: z.string(),
  phone: z.string().nullable(),
  budgetMinAmd: amdAmountSchema.nullable(),
  budgetMaxAmd: amdAmountSchema.nullable(),
  preferredRooms: z.array(z.number().int()),
  priorities: prioritiesSchema,
  commuteAnchor: commuteAnchorSchema.nullable(),
  onboardingCompletedAt: isoDateTimeSchema.nullable(),
});
export type Profile = z.infer<typeof profileSchema>;

export const meResponseSchema = userSchema.extend({
  profile: profileSchema.nullable(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const adminUsersQuerySchema = paginationQuerySchema.extend({
  role: roleSchema.optional(),
  /** Case-insensitive substring match on email or display name. */
  search: z.string().trim().min(1).max(80).optional(),
});
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

export const updateUserRoleBodySchema = z.object({
  role: roleSchema,
});
export type UpdateUserRoleBody = z.infer<typeof updateUserRoleBodySchema>;

export const adminUserSchema = userSchema.extend({
  isActive: z.boolean(),
  updatedAt: isoDateTimeSchema,
});
export type AdminUser = z.infer<typeof adminUserSchema>;
