import { z } from 'zod';

/** Uniform error envelope returned by every API endpoint. */
export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  message: z.string(),
  /** Machine-readable code for client branching, e.g. "VALIDATION_FAILED". */
  code: z.string().optional(),
  /**
   * Machine-readable context a domain rule attached, such as the transitions
   * that would have been legal or the quota that was reached. Free-form by
   * design: each `code` documents its own keys.
   */
  context: z.record(z.string(), z.unknown()).optional(),
  /** Field-level issues for validation errors. */
  details: z
    .array(
      z.object({
        path: z.string(),
        message: z.string(),
      }),
    )
    .optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
