import { z } from 'zod';

/** Uniform error envelope returned by every API endpoint. */
export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  message: z.string(),
  /** Machine-readable code for client branching, e.g. "VALIDATION_FAILED". */
  code: z.string().optional(),
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
