import { apiErrorSchema, type ApiError as ApiErrorBody } from '@smartestate/contracts';

/**
 * Error thrown by the API layer. Wraps the shared `ApiError` envelope so UI code
 * can branch on `statusCode` / `code` and show `details` next to form fields.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string | undefined;
  readonly details: ApiErrorBody['details'];

  constructor(body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.statusCode = body.statusCode;
    this.code = body.code;
    this.details = body.details;
  }

  /** Field-level messages keyed by path, convenient for React Hook Form `setError`. */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries((this.details ?? []).map((issue) => [issue.path, issue.message]));
  }

  static isApiError(value: unknown): value is ApiError {
    return value instanceof ApiError;
  }
}

/**
 * Builds an `ApiError` from whatever the server (or a proxy) returned. Bodies
 * that are not the shared envelope — HTML from a gateway, an empty body — are
 * normalised so callers always get the same shape.
 */
export function toApiError(status: number, body: unknown): ApiError {
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) {
    return new ApiError(parsed.data);
  }
  return new ApiError({
    statusCode: status,
    error: status >= 500 ? 'Server Error' : 'Request Failed',
    message:
      status >= 500
        ? 'The server could not process the request'
        : `Request failed with status ${String(status)}`,
    code: status === 0 ? 'NETWORK' : 'UNKNOWN',
  });
}

/** Thrown when the request never reached the server (offline, DNS, CORS). */
export function networkError(cause: unknown): ApiError {
  const error = new ApiError({
    statusCode: 0,
    error: 'Network Error',
    message: 'Could not reach the server',
    code: 'NETWORK',
  });
  error.cause = cause;
  return error;
}
