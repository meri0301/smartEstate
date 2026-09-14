import { describe, expect, it } from 'vitest';
import { DomainError, isDomainError } from './domain-error.js';

class SampleError extends DomainError {
  readonly code = 'SAMPLE';
  readonly status = 409;
}

describe('DomainError', () => {
  it('reports the concrete class name, which is what logs show', () => {
    const error = new SampleError('something conflicted');
    expect(error.name).toBe('SampleError');
    expect(error.message).toBe('something conflicted');
  });

  it('is recognisable without importing every subclass', () => {
    expect(isDomainError(new SampleError('x'))).toBe(true);
    expect(isDomainError(new Error('x'))).toBe(false);
    expect(isDomainError(undefined)).toBe(false);
  });
});
