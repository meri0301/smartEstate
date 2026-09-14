import {
  districtBoundaryResponseSchema,
  districtSchema,
  districtSlugSchema,
} from '@smartestate/contracts';
import { z } from 'zod';
import { createZodDto } from '../../common/zod/zod-dto.js';

export class DistrictDto extends createZodDto(districtSchema, {
  name: 'DistrictDto',
  io: 'output',
}) {}
export class DistrictBoundaryResponseDto extends createZodDto(districtBoundaryResponseSchema, {
  name: 'DistrictBoundaryResponseDto',
  io: 'output',
}) {}
export class DistrictParamsDto extends createZodDto(z.object({ slug: districtSlugSchema }), {
  name: 'DistrictParamsDto',
}) {}
