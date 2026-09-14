import type { ArgumentMetadata } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createZodDto } from './zod-dto.js';
import { ValidationException, ZodValidationPipe } from './zod-validation.pipe.js';

const Dto = createZodDto(
  z.object({ limit: z.coerce.number().int().default(20), name: z.string().min(2) }),
  {
    name: 'PipeSpecDto',
  },
);

const metadata = (metatype: ArgumentMetadata['metatype']): ArgumentMetadata => ({
  type: 'body',
  metatype,
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe();

  it('parses, coerces and applies defaults for Zod DTOs', () => {
    expect(pipe.transform({ name: 'ok', limit: '5' }, metadata(Dto))).toEqual({
      name: 'ok',
      limit: 5,
    });
    expect(pipe.transform({ name: 'ok' }, metadata(Dto))).toEqual({ name: 'ok', limit: 20 });
  });

  it('throws a 400 with field-level details on invalid input', () => {
    try {
      pipe.transform({ name: 'x' }, metadata(Dto));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationException);
      const body = (error as ValidationException).getResponse();
      expect(body).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        details: [{ path: 'name' }],
      });
    }
  });

  it('passes through parameters that are not Zod DTOs', () => {
    expect(pipe.transform('raw', metadata(String))).toBe('raw');
    expect(pipe.transform({ a: 1 }, metadata(undefined))).toEqual({ a: 1 });
  });
});
