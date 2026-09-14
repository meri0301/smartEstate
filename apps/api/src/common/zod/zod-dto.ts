/**
 * Bridge between Zod schemas (the single source of truth in @smartestate/contracts)
 * and NestJS: a DTO class carries its schema for the validation pipe and exposes
 * OpenAPI metadata for @nestjs/swagger. Zod 4 emits JSON Schema natively, so no
 * third-party adapter is needed and the documented shape is exactly the
 * validated shape.
 */
import type { SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

/**
 * Property metadata consumed by @nestjs/swagger's `_OPENAPI_METADATA_FACTORY` hook
 * (the package does not export its `SchemaObjectMetadata` type). Keys mirror
 * `@ApiProperty` options: type, required / selfRequired, enum, nullable, format, …
 */
export type SchemaObjectMetadata = Record<string, unknown>;

export interface ZodDtoClass<TSchema extends z.ZodType = z.ZodType> {
  new (): z.output<TSchema>;
  readonly name: string;
  readonly schema: TSchema;
  /** Full JSON Schema (OpenAPI 3.0 dialect) used to replace swagger's component. */
  readonly openApiSchema: SchemaObject;
  /** Hook read by @nestjs/swagger to build property metadata for the class. */
  _OPENAPI_METADATA_FACTORY(): Record<string, SchemaObjectMetadata>;
}

interface JsonSchemaNode {
  type?: string | string[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  enum?: unknown[];
  anyOf?: JsonSchemaNode[];
  nullable?: boolean;
  format?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  additionalProperties?: boolean | JsonSchemaNode;
  $schema?: string;
}

const registry = new Map<string, ZodDtoClass>();

export interface CreateZodDtoOptions {
  /**
   * Component name in the OpenAPI document; must equal the name of the class that
   * extends the result, because @nestjs/swagger names components after that class.
   */
  name: string;
  /** Validate the input side (requests, default) or the output side (responses). */
  io?: 'input' | 'output';
}

export function createZodDto<TSchema extends z.ZodType>(
  schema: TSchema,
  options: CreateZodDtoOptions,
): ZodDtoClass<TSchema> {
  const jsonSchema = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io: options.io ?? 'input',
    unrepresentable: 'any',
  }) as JsonSchemaNode;
  const { $schema: _ignored, ...openApiSchema } = jsonSchema;

  class ZodDto {
    static readonly schema = schema;
    static readonly openApiSchema = openApiSchema as SchemaObject;
    static _OPENAPI_METADATA_FACTORY(): Record<string, SchemaObjectMetadata> {
      return toPropertyMetadata(jsonSchema);
    }
  }
  Object.defineProperty(ZodDto, 'name', { value: options.name });

  const dto = ZodDto as unknown as ZodDtoClass<TSchema>;
  if (registry.has(options.name)) {
    throw new Error(`Duplicate Zod DTO name "${options.name}"`);
  }
  registry.set(options.name, dto);
  return dto;
}

export function isZodDto(value: unknown): value is ZodDtoClass {
  return (
    typeof value === 'function' &&
    'schema' in value &&
    (value as { schema: unknown }).schema instanceof z.ZodType
  );
}

/** Every DTO created so far, for post-processing the OpenAPI document. */
export function registeredZodDtos(): readonly ZodDtoClass[] {
  return [...registry.values()];
}

/**
 * Converts the top-level object properties of a JSON schema into swagger
 * property metadata. Nested objects and arrays are described inline.
 */
export function toPropertyMetadata(schema: JsonSchemaNode): Record<string, SchemaObjectMetadata> {
  const required = new Set(schema.required ?? []);
  const result: Record<string, SchemaObjectMetadata> = {};
  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    const metadata = toMetadata(property);
    // For inline objects swagger keeps `required` for the nested field list and
    // uses `selfRequired` for the property itself.
    const requiredFlag =
      metadata.type === 'object'
        ? { selfRequired: required.has(name) }
        : { required: required.has(name) };
    result[name] = { ...metadata, ...requiredFlag };
  }
  return result;
}

function toMetadata(node: JsonSchemaNode): Record<string, unknown> {
  // openapi-3.0 target expresses nullability with `nullable`, but unions with
  // null can still surface as anyOf; normalise both.
  if (node.anyOf !== undefined) {
    const nonNull = node.anyOf.filter((n) => n.type !== 'null');
    if (nonNull.length === 1 && nonNull[0] !== undefined) {
      return {
        ...toMetadata(nonNull[0]),
        nullable: nonNull.length !== node.anyOf.length || node.nullable === true,
      };
    }
    return { oneOf: node.anyOf.map((n) => toMetadata(n)) };
  }

  const type = Array.isArray(node.type) ? node.type.find((t) => t !== 'null') : node.type;
  const base: Record<string, unknown> = {};
  for (const key of [
    'format',
    'description',
    'default',
    'minimum',
    'maximum',
    'minLength',
    'maxLength',
    'minItems',
    'maxItems',
    'pattern',
  ] as const) {
    if (node[key] !== undefined) {
      base[key] = node[key];
    }
  }
  if (node.nullable === true || (Array.isArray(node.type) && node.type.includes('null'))) {
    base.nullable = true;
  }
  if (node.enum !== undefined) {
    base.enum = node.enum;
  }

  if (type === 'array') {
    return {
      ...base,
      type: 'array',
      items: node.items === undefined ? {} : toMetadata(node.items),
    };
  }
  if (type === 'object') {
    return {
      ...base,
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(node.properties ?? {}).map(([key, value]) => [key, toMetadata(value)]),
      ),
      ...(node.required !== undefined ? { required: node.required } : {}),
      ...(node.additionalProperties !== undefined
        ? {
            additionalProperties:
              typeof node.additionalProperties === 'boolean'
                ? node.additionalProperties
                : toMetadata(node.additionalProperties),
          }
        : {}),
    };
  }
  return { ...base, type: type ?? 'string' };
}
