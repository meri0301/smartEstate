import { describe, expect, it } from 'vitest';
import { ApiError } from './api-error.js';
import { shouldRetry } from './query-client.js';

const apiError = (statusCode: number): ApiError =>
  new ApiError({ statusCode, error: 'x', message: 'x' });

describe('shouldRetry', () => {
  it('never retries client errors', () => {
    expect(shouldRetry(0, apiError(400))).toBe(false);
    expect(shouldRetry(0, apiError(404))).toBe(false);
    expect(shouldRetry(0, apiError(401))).toBe(false);
  });

  it('retries network and server errors up to two times', () => {
    expect(shouldRetry(0, apiError(0))).toBe(true);
    expect(shouldRetry(1, apiError(503))).toBe(true);
    expect(shouldRetry(2, apiError(503))).toBe(false);
  });

  it('retries unknown error types conservatively', () => {
    expect(shouldRetry(0, new Error('boom'))).toBe(true);
    expect(shouldRetry(2, new Error('boom'))).toBe(false);
  });
});
