/**
 * Base class for errors raised by domain services.
 *
 * Domain rules are expressed without reference to HTTP: a state machine knows
 * that a transition is illegal, not that the answer is 409. Each error carries
 * the status and machine-readable code it should surface as, and the global
 * exception filter translates it into the shared `ApiError` envelope. That keeps
 * the rules unit-testable without a request, and keeps `@nestjs/common`
 * exception classes out of the domain layer.
 */
export abstract class DomainError extends Error {
  /** Stable identifier a client may branch on; mirrored into `ApiError.code`. */
  abstract readonly code: string;
  /** HTTP status this error should be reported as. */
  abstract readonly status: number;
  /** Extra machine-readable context, copied into the response body. */
  readonly context: Readonly<Record<string, unknown>> = {};

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}
