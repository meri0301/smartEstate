import {
  buildingSchema,
  createBuildingBodySchema,
  createListingBodySchema,
  listingDetailSchema,
  listingSearchQuerySchema,
  listingSummarySchema,
  listingTransitionBodySchema,
  listingsPageSchema,
  publicIdSchema,
  updateListingBodySchema,
  uuidSchema,
} from '@smartestate/contracts';
import { z } from 'zod';
import { createZodDto } from '../../common/zod/zod-dto.js';

export class ListingSearchQueryDto extends createZodDto(listingSearchQuerySchema, {
  name: 'ListingSearchQueryDto',
}) {}
export class CreateListingBodyDto extends createZodDto(createListingBodySchema, {
  name: 'CreateListingBodyDto',
}) {}
export class UpdateListingBodyDto extends createZodDto(updateListingBodySchema, {
  name: 'UpdateListingBodyDto',
}) {}
export class ListingTransitionBodyDto extends createZodDto(listingTransitionBodySchema, {
  name: 'ListingTransitionBodyDto',
}) {}
export class ListingSummaryDto extends createZodDto(listingSummarySchema, {
  name: 'ListingSummaryDto',
  io: 'output',
}) {}
export class ListingDetailDto extends createZodDto(listingDetailSchema, {
  name: 'ListingDetailDto',
  io: 'output',
}) {}
export class ListingsPageDto extends createZodDto(listingsPageSchema, {
  name: 'ListingsPageDto',
  io: 'output',
}) {}
export class ListingLookupParamsDto extends createZodDto(
  z.object({ idOrPublicId: z.union([uuidSchema, publicIdSchema]) }),
  { name: 'ListingLookupParamsDto' },
) {}
export class ListingParamsDto extends createZodDto(z.object({ id: uuidSchema }), {
  name: 'ListingParamsDto',
}) {}

export class CreateBuildingBodyDto extends createZodDto(createBuildingBodySchema, {
  name: 'CreateBuildingBodyDto',
}) {}
export class BuildingDto extends createZodDto(buildingSchema, {
  name: 'BuildingDto',
  io: 'output',
}) {}
export class BuildingParamsDto extends createZodDto(z.object({ id: uuidSchema }), {
  name: 'BuildingParamsDto',
}) {}
