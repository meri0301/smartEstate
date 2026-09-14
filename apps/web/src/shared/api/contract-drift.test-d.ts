/**
 * Compile-time drift guard between the OpenAPI-generated client types and the
 * hand-written Zod contracts. If the API changes a response shape and the
 * exported document is regenerated, `pnpm typecheck` fails here until the
 * contracts (and thus the UI) are updated — or vice versa.
 */
import type {
  AuthResponse,
  District,
  ListingDetail,
  ListingsPage,
  MeResponse,
  RegisterBody,
} from '@smartestate/contracts';
import { describe, expectTypeOf, it } from 'vitest';
import type { paths } from './schema.js';

type Json<T> = T extends { content: { 'application/json': infer B } } ? B : never;
type Ok<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends {
  responses: infer R;
}
  ? R extends { 200: infer S }
    ? Json<S>
    : R extends { 201: infer S }
      ? Json<S>
      : never
  : never;

describe('generated client types match the contracts', () => {
  it('responses', () => {
    expectTypeOf<Ok<'/api/listings', 'get'>>().toExtend<ListingsPage>();
    expectTypeOf<ListingsPage>().toExtend<Ok<'/api/listings', 'get'>>();

    expectTypeOf<Ok<'/api/listings/{idOrPublicId}', 'get'>>().toExtend<ListingDetail>();
    expectTypeOf<ListingDetail>().toExtend<Ok<'/api/listings/{idOrPublicId}', 'get'>>();

    expectTypeOf<Ok<'/api/auth/login', 'post'>>().toExtend<AuthResponse>();
    expectTypeOf<Ok<'/api/users/me', 'get'>>().toExtend<MeResponse>();
    expectTypeOf<Ok<'/api/districts', 'get'>>().toExtend<District[]>();
  });

  it('request bodies accept what the forms produce', () => {
    type RegisterRequest = paths['/api/auth/register']['post']['requestBody'];
    expectTypeOf<RegisterBody>().toExtend<Json<RegisterRequest>>();
  });
});
