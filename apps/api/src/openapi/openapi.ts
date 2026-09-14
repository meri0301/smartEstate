import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { REFRESH_COOKIE_NAME } from '@smartestate/contracts';
import { registeredZodDtos } from '../common/zod/zod-dto.js';

export const API_VERSION = '0.2.0';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('SmartEstate API')
    .setDescription(
      'AI-assisted apartment search and buying advisor for the Armenian market. ' +
        'All request and response shapes are defined once as Zod schemas in @smartestate/contracts; ' +
        'this document is generated from them.',
    )
    .setVersion(API_VERSION)
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Short-lived access token',
    })
    .addCookieAuth(REFRESH_COOKIE_NAME, { type: 'apiKey', in: 'cookie', name: REFRESH_COOKIE_NAME })
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}.${methodKey}`,
  });
  applyZodComponentSchemas(document);
  return document;
}

/**
 * Swagger derives component schemas from the DTO classes' property metadata,
 * which is a flattened approximation. Replace each Zod DTO component with the
 * exact JSON Schema produced by Zod so the document matches validation precisely.
 */
export function applyZodComponentSchemas(document: OpenAPIObject): void {
  const schemas = document.components?.schemas;
  if (schemas === undefined) {
    return;
  }
  for (const dto of registeredZodDtos()) {
    if (dto.name in schemas) {
      schemas[dto.name] = dto.openApiSchema;
    }
  }
}

export function setupSwagger(app: INestApplication, document: OpenAPIObject): void {
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/openapi.json',
    swaggerOptions: { persistAuthorization: true },
  });
}
