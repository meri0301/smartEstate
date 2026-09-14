import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createZodDto, isZodDto, registeredZodDtos, toPropertyMetadata } from './zod-dto.js';

describe('createZodDto', () => {
  const schema = z.object({
    email: z.email(),
    rooms: z.number().int().min(1).max(10).optional(),
    role: z.enum(['USER', 'ADMIN']).default('USER'),
    tags: z.array(z.string()).nullable(),
    address: z.object({ city: z.string(), zip: z.string().optional() }),
  });
  const Dto = createZodDto(schema, { name: 'SpecExampleDto' });

  it('names the class and keeps the schema for the validation pipe', () => {
    expect(Dto.name).toBe('SpecExampleDto');
    expect(Dto.schema).toBe(schema);
    expect(isZodDto(Dto)).toBe(true);
    expect(isZodDto(class Plain {})).toBe(false);
    expect(isZodDto('nope')).toBe(false);
  });

  it('registers the DTO for OpenAPI post-processing', () => {
    expect(registeredZodDtos().some((dto) => dto.name === 'SpecExampleDto')).toBe(true);
  });

  it('produces swagger property metadata with required flags and constraints', () => {
    const metadata = Dto._OPENAPI_METADATA_FACTORY();
    expect(metadata.email).toMatchObject({ type: 'string', format: 'email', required: true });
    expect(metadata.rooms).toMatchObject({
      type: 'integer',
      minimum: 1,
      maximum: 10,
      required: false,
    });
    expect(metadata.role).toMatchObject({
      type: 'string',
      enum: ['USER', 'ADMIN'],
      required: false,
    });
    expect(metadata.tags).toMatchObject({ type: 'array', nullable: true, required: true });
    expect(metadata.address).toMatchObject({
      type: 'object',
      selfRequired: true,
      required: ['city'],
      properties: { city: { type: 'string' }, zip: { type: 'string' } },
    });
  });

  it('exposes the full OpenAPI 3.0 schema without the $schema keyword', () => {
    expect(Dto.openApiSchema).not.toHaveProperty('$schema');
    expect(Dto.openApiSchema).toMatchObject({
      type: 'object',
      required: ['email', 'tags', 'address'],
    });
  });

  it('rejects duplicate names', () => {
    expect(() => createZodDto(z.object({}), { name: 'SpecExampleDto' })).toThrow(/Duplicate/);
  });
});

describe('toPropertyMetadata', () => {
  it('normalises anyOf-with-null into a nullable scalar', () => {
    const metadata = toPropertyMetadata({
      type: 'object',
      properties: { value: { anyOf: [{ type: 'number' }, { type: 'null' }] } },
    });
    expect(metadata.value).toMatchObject({ type: 'number', nullable: true, required: false });
  });

  it('keeps genuine unions as oneOf', () => {
    const metadata = toPropertyMetadata({
      type: 'object',
      properties: {
        value: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
      },
    });
    expect(metadata.value).toMatchObject({ oneOf: [{ type: 'string' }, { type: 'array' }] });
  });
});
