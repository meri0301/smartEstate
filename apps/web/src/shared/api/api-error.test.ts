import { describe, expect, it } from 'vitest';
import { ApiError, networkError, toApiError } from './api-error.js';

describe('toApiError', () => {
  it('preserves the shared envelope', () => {
    const error = toApiError(400, {
      statusCode: 400,
      error: 'Bad Request',
      message: 'Validation failed',
      code: 'VALIDATION_FAILED',
      details: [{ path: 'email', message: 'Invalid email' }],
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.fieldErrors()).toEqual({ email: 'Invalid email' });
    expect(ApiError.isApiError(error)).toBe(true);
    expect(ApiError.isApiError(new Error('x'))).toBe(false);
  });

  it('normalises non-envelope bodies such as gateway HTML', () => {
    const error = toApiError(502, '<html>Bad gateway</html>');
    expect(error.statusCode).toBe(502);
    expect(error.code).toBe('UNKNOWN');
    expect(error.message).toBe('The server could not process the request');
    expect(error.fieldErrors()).toEqual({});
  });

  it('marks unreachable servers as network errors with the cause attached', () => {
    const cause = new TypeError('Failed to fetch');
    const error = networkError(cause);
    expect(error.statusCode).toBe(0);
    expect(error.code).toBe('NETWORK');
    expect(error.cause).toBe(cause);
  });
});
